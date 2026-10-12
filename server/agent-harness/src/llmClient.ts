import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import type {
  LLMClient,
  CompletionRequest,
  CompletionResponse,
  CanonicalMessage,
  ContentBlock,
  ToolDefinition,
  ProviderConfig,
} from './types.js';

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: string;
  }>;
}

function canonicalToolsToOpenAI(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

function canonicalMessagesToOpenAI(messages: CanonicalMessage[]): OpenAIMessage[] {
  const result: OpenAIMessage[] = [];

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      result.push({ role: msg.role as OpenAIMessage['role'], content: msg.content });
      continue;
    }

    if (msg.role === 'tool') {
      // Canonical tool results map to OpenAI tool messages.
      for (const block of msg.content) {
        if (block.type === 'tool_result') {
          result.push({
            role: 'tool',
            content: block.content ?? '',
            tool_call_id: block.tool_use_id ?? '',
          });
        }
      }
      continue;
    }

    if (msg.role === 'assistant') {
      const toolUseBlocks = msg.content.filter((b): b is ContentBlock & { type: 'tool_use' } => b.type === 'tool_use');
      const textBlock = msg.content.find((b) => b.type === 'text');

      if (toolUseBlocks.length > 0) {
        result.push({
          role: 'assistant',
          content: textBlock?.text ?? null,
          tool_calls: toolUseBlocks.map((b) => ({
            id: b.id ?? uuidv4(),
            type: 'function' as const,
            function: {
              name: b.name ?? '',
              arguments: JSON.stringify(b.input ?? {}),
            },
          })),
        });
        continue;
      }
    }

    const textBlock = msg.content.find((b) => b.type === 'text');
    result.push({
      role: msg.role as OpenAIMessage['role'],
      content: textBlock?.text ?? '',
    });
  }

  return result;
}

class OllamaClient implements LLMClient {
  private readonly cfg: ProviderConfig;

  constructor(cfg: ProviderConfig) {
    this.cfg = cfg;
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const messages = canonicalMessagesToOpenAI(req.messages);
    const tools = req.tools && req.tools.length > 0 ? canonicalToolsToOpenAI(req.tools) : undefined;

    const payload: Record<string, unknown> = {
      model: req.model,
      messages,
      max_tokens: req.maxTokens,
      temperature: req.temperature,
    };
    if (tools) payload['tools'] = tools;

    const url = `${this.cfg.baseURL}/chat/completions`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.cfg.apiKey) headers['Authorization'] = `Bearer ${this.cfg.apiKey}`;

    const response = await axios.post<OpenAIResponse>(url, payload, { headers });
    const raw = response.data;
    const choice = raw.choices[0];
    const finishReason = choice.finish_reason;
    const message = choice.message;

    const content: ContentBlock[] = [];

    if (message.content) {
      content.push({ type: 'text', text: message.content });
    }

    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const tc of message.tool_calls) {
        const id = tc.id || uuidv4();
        let input: unknown = {};
        try {
          input = JSON.parse(tc.function.arguments);
        } catch {
          input = { command: tc.function.arguments };
        }
        content.push({
          type: 'tool_use',
          id,
          name: tc.function.name,
          input,
        });
      }
    }

    let stopReason: CompletionResponse['stopReason'];
    if (finishReason === 'tool_calls') {
      stopReason = 'tool_use';
    } else if (finishReason === 'stop') {
      stopReason = 'end_turn';
    } else if (finishReason === 'length') {
      stopReason = 'max_tokens';
    } else {
      stopReason = finishReason ?? 'end_turn';
    }

    return { stopReason, content, raw };
  }
}

export function createLLMClient(cfg: ProviderConfig): LLMClient {
  return new OllamaClient(cfg);
}