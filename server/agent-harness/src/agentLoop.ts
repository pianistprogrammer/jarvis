import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import type { Socket } from 'socket.io';
import type { LLMClient, SessionState, ContentBlock } from './types.js';
import { TOOL_DEFINITIONS } from './constants.js';
import { config } from './config.js';
import { evaluatePermission } from './permissions.js';
import { runFileTool, summarizeFileToolCall, type ToolExecutionResult } from './fileTools.js';

interface CommandResult {
  output: string;
  exitCode: number;
}

interface ToolStartPayload {
  toolId: string;
  toolName: string;
  summary: string;
}

interface ToolEndPayload extends ToolStartPayload {
  ok: boolean;
  diff?: string;
}

interface PermissionResponsePayload {
  requestId: string;
  approved: boolean;
}

async function requestPermission(socket: Socket, command: string): Promise<boolean> {
  const requestId = randomUUID();
  const timeoutMs = parseInt(process.env['PERMISSION_PROMPT_TIMEOUT_MS'] ?? '120000', 10);

  socket.emit('permission-request', { requestId, command, timeoutMs });

  return new Promise((resolve) => {
    let settled = false;

    const cleanup = () => {
      socket.off('permission-response', onResponse);
      socket.off('disconnect', onDisconnect);
      clearTimeout(timer);
    };

    const finish = (approved: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(approved);
    };

    const onResponse = (payload: PermissionResponsePayload) => {
      if (!payload || payload.requestId !== requestId) return;
      finish(Boolean(payload.approved));
    };

    const onDisconnect = () => {
      finish(false);
    };

    const timer = setTimeout(() => {
      finish(false);
    }, timeoutMs);

    socket.on('permission-response', onResponse);
    socket.on('disconnect', onDisconnect);
  });
}

async function runCommandWithPermissions(socket: Socket, cwd: string, command: string): Promise<CommandResult> {
  const decision = evaluatePermission('Bash', command);

  if (decision.tier === 'deny') {
    const reason = decision.matchedRule?.pattern
      ? `blocked by policy rule (${decision.matchedRule.pattern})`
      : 'blocked by policy';
    const output = `Command blocked: ${reason}`;
    socket.emit('bash-stderr', output);
    socket.emit('bash-end', 'Command blocked by policy (exit code 126)');
    return { output, exitCode: 126 };
  }

  if (decision.tier === 'ask') {
    socket.emit('agent-status', 'Awaiting approval...');
    const approved = await requestPermission(socket, command);
    if (!approved) {
      const output = 'Command blocked: user did not approve request';
      socket.emit('bash-stderr', output);
      socket.emit('bash-end', 'Command not approved (exit code 126)');
      return { output, exitCode: 126 };
    }
    socket.emit('agent-status', 'Thinking...');
  }

  return runCommandStreaming(socket, cwd, command);
}

function runCommandStreaming(socket: Socket, cwd: string, command: string): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      cwd,
      timeout: config.commandTimeoutMs,
    });

    let output = '';

    child.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      output += text;
      socket.emit('bash-stdout', text);
    });

    child.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      output += text;
      socket.emit('bash-stderr', text);
    });

    child.on('close', (exitCode: number | null, signal: NodeJS.Signals | null) => {
      const code = exitCode ?? (signal ? -1 : 0);
      socket.emit('bash-end', `Command finished with exit code ${code}${signal ? ` (${signal})` : ''}`);
      resolve({ output, exitCode: code });
    });

    child.on('error', (err: Error) => {
      socket.emit('bash-stderr', `Spawn error: ${err.message}`);
      resolve({ output: output + err.message, exitCode: -1 });
    });
  });
}

async function runToolCall(socket: Socket, session: SessionState, toolCall: ContentBlock): Promise<ToolExecutionResult> {
  const toolName = toolCall.name;

  if (toolName === 'execute_bash') {
    const command = (toolCall.input as { command?: unknown })?.command;
    if (typeof command !== 'string') {
      return {
        output: 'Tool error: command must be a string.',
        isError: true,
        summary: 'invalid bash command',
      };
    }

    socket.emit('bash-start', command);
    const result = await runCommandWithPermissions(socket, session.workspace, command);

    return {
      output: result.output,
      isError: result.exitCode !== 0,
      summary: `bash exit ${result.exitCode}`,
    };
  }

  const summary = summarizeFileToolCall(toolName, toolCall.input);
  const startPayload: ToolStartPayload = {
    toolId: toolCall.id ?? randomUUID(),
    toolName: toolName ?? 'unknown_tool',
    summary,
  };
  socket.emit('tool-start', startPayload);

  const result = await runFileTool(session.workspace, toolName, toolCall.input);
  const endPayload: ToolEndPayload = {
    ...startPayload,
    ok: !result.isError,
    summary: result.summary,
    diff: result.diff,
  };
  socket.emit('tool-end', endPayload);

  return result;
}

export async function runAgentLoop(
  socket: Socket,
  llmClient: LLMClient,
  session: SessionState,
  userPrompt: string,
  runtimeModel: string,
): Promise<void> {
  session.history.push({ role: 'user', content: userPrompt });

  try {
    for (let i = 0; i < config.maxIterations; i++) {
      socket.emit('agent-status', 'Thinking...');

      const response = await llmClient.complete({
        model: runtimeModel,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        messages: session.history,
        tools: TOOL_DEFINITIONS,
      });

      session.history.push({ role: 'assistant', content: response.content });

      if (response.stopReason !== 'tool_use') {
        const textBlock = response.content.find((c: ContentBlock) => c.type === 'text');
        const finalText = textBlock?.text ?? '';
        socket.emit('agent-response', finalText);
        socket.emit('agent-status', 'Idle');
        return;
      }

      const toolCalls = response.content.filter((c: ContentBlock) => c.type === 'tool_use');
      if (toolCalls.length === 0 || toolCalls.some((toolCall) => !toolCall.id)) {
        socket.emit('system-error', 'Tool use response missing tool call');
        socket.emit('agent-status', 'Idle');
        return;
      }

      const toolResults: ContentBlock[] = [];
      for (const toolCall of toolCalls) {
        const result = await runToolCall(socket, session, toolCall);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id!,
          content: result.output.slice(0, config.toolResultMaxChars),
          is_error: result.isError,
        });
      }

      session.history.push({
        role: 'tool',
        content: toolResults,
      });

      // Drain any steering prompts the user sent mid-run
      while (session.promptQueue.length > 0) {
        const steered = session.promptQueue.shift()!;
        socket.emit('agent-steered', steered);
        session.history.push({ role: 'user', content: `[User steering mid-run]: ${steered}` });
      }
    }

    socket.emit('system-error', 'Max iterations reached without a final response');
    socket.emit('agent-status', 'Idle');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    socket.emit('system-error', `Agent error: ${message}`);
    socket.emit('agent-status', 'Idle');
  }
}
