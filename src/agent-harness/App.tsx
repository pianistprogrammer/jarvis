import { useEffect, useRef, useState, useCallback } from 'react';
import { MessageList } from './components/MessageList';
import { ChatInput } from './components/ChatInput';
import { Header } from './components/Header';
import { WelcomeScreen } from './components/WelcomeScreen';
import { useSocket } from './hooks/useSocket';
import { sapColors } from './theme';
import type { Message, MessageData } from './types';

let _id = 0;
function nextId() { return String(++_id); }

function msg(data: MessageData): Message {
  return { id: nextId(), data };
}

export default function App() {
  const { socket, isConnected, restartSession } = useSocket('/');
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasStarted, setHasStarted] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [workspacePath, setWorkspacePath] = useState('');
  const [providerInfo, setProviderInfo] = useState('');
  const [modelInfo, setModelInfo] = useState('');
  const currentCmdId = useRef<string | null>(null);
  const currentTurnId = useRef<string | null>(null);

  function push(data: MessageData) {
    setMessages((prev) => [...prev, msg(data)]);
  }

  const handlePermissionDecision = useCallback((requestId: string, approved: boolean, command: string) => {
    socket.current?.emit('permission-response', { requestId, approved });

    setMessages((prev) => prev.filter((m) => {
      return !(m.data.kind === 'approval-request' && m.data.requestId === requestId);
    }));

    push({ kind: 'status', text: approved ? `approved  ${command}` : `rejected  ${command}` });
  }, [socket]);

  // Append bash output to existing messages (no new entry — updates BashBlock in place)
  function appendBashOut(text: string, stream: 'stdout' | 'stderr') {
    const cmdId = currentCmdId.current;
    if (!cmdId) return;
    setMessages((prev) => [...prev, msg({ kind: 'bash-out', text, stream, cmdId })]);
  }

  const refreshRuntimeConfig = useCallback(async () => {
    const response = await fetch('/api/runtime-config');
    if (!response.ok) throw new Error(`Failed to load runtime config (${response.status})`);
    const data = await response.json() as { provider: string; model: string };
    setProviderInfo(data.provider);
    setModelInfo(data.model);
    return data;
  }, []);

  const updateRuntimeConfig = useCallback(async (patch: { provider?: string; model?: string }) => {
    const response = await fetch('/api/runtime-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await response.json() as { provider?: string; model?: string; error?: string };

    if (!response.ok || !data.provider || !data.model) {
      throw new Error(data.error ?? `Failed to update runtime config (${response.status})`);
    }

    setProviderInfo(data.provider);
    setModelInfo(data.model);

    if (patch.provider && patch.provider !== providerInfo) {
      push({ kind: 'status', text: `provider switched to ${data.provider}` });
    }
    if (patch.model && patch.model !== modelInfo) {
      push({ kind: 'status', text: `model switched to ${data.model}` });
    }

    return { provider: data.provider, model: data.model };
  }, [modelInfo, providerInfo]);

  const loadModels = useCallback(async (provider?: string) => {
    const query = provider ? `?provider=${encodeURIComponent(provider)}` : '';
    const response = await fetch(`/api/models${query}`);
    const data = await response.json() as { models?: string[]; error?: string };
    if (!response.ok) {
      throw new Error(data.error ?? `Failed to load models (${response.status})`);
    }
    return data.models ?? [];
  }, []);

  const resetSession = useCallback(() => {
    currentCmdId.current = null;
    currentTurnId.current = null;
    setMessages([]);
    setHasStarted(false);
    setIsThinking(false);
    setWorkspacePath('');
    restartSession();
  }, [restartSession]);

  useEffect(() => {
    void refreshRuntimeConfig().catch(() => {
      // initial state will still arrive over the socket if fetch fails
    });
  }, [refreshRuntimeConfig]);

  useEffect(() => {
    const s = socket.current;
    if (!s) return;

    function onConnect() {
      push({ kind: 'status', text: '● session connected' });
    }

    function onDisconnect() {
      push({ kind: 'status', text: '● disconnected' });
      setIsThinking(false);
    }

    function onSystemMessage(m: string) {
      const wsMatch = m.match(/Workspace:\s*(.+)/);
      if (wsMatch) {
        setWorkspacePath(wsMatch[1].trim());
        push({ kind: 'status', text: `workspace  ${wsMatch[1].trim()}` });
      }
      const runtimeMatch = m.match(/Provider:\s*(.+?)\s*\|\s*Model:\s*(.+)/);
      if (runtimeMatch) {
        setProviderInfo(runtimeMatch[1].trim());
        setModelInfo(runtimeMatch[2].trim());
      }
    }

    function onRuntimeConfig(data: { provider: string; model: string }) {
      setProviderInfo(data.provider);
      setModelInfo(data.model);
    }

    function onAgentStatus(status: string) {
      if (status === 'Idle') {
        setIsThinking(false);
        return;
      }

      if (status === 'Awaiting approval...') {
        setIsThinking(false);
        return;
      }

      setIsThinking(true);
    }

    function onBashStart(command: string) {
      const cmdId = nextId();
      currentCmdId.current = cmdId;
      setMessages((prev) => [...prev, msg({ kind: 'bash-cmd', command, cmdId })]);
    }

    function onBashStdout(chunk: string) {
      appendBashOut(chunk, 'stdout');
    }

    function onBashStderr(chunk: string) {
      appendBashOut(chunk, 'stderr');
    }

    function onBashEnd(statusMsg: string) {
      const cmdId = currentCmdId.current;
      if (!cmdId) return;
      const match = statusMsg.match(/exit code (-?\d+)/);
      const exitCode = match ? parseInt(match[1]) : 0;
      setMessages((prev) => [...prev, msg({ kind: 'bash-end', exitCode, cmdId })]);
    }

    function onToolStart(payload: { toolId: string; toolName: string; summary: string }) {
      if (!payload?.toolId || !payload?.toolName) return;
      setMessages((prev) => [...prev, msg({
        kind: 'tool-call',
        toolId: payload.toolId,
        toolName: payload.toolName,
        summary: payload.summary ?? payload.toolName,
      })]);
    }

    function onToolEnd(payload: { toolId: string; ok: boolean; summary: string; diff?: string }) {
      if (!payload?.toolId) return;
      setMessages((prev) => [...prev, msg({
        kind: 'tool-end',
        toolId: payload.toolId,
        ok: Boolean(payload.ok),
        summary: payload.summary ?? 'finished',
        diff: payload.diff,
      })]);
    }

    function onAgentResponse(text: string) {
      const turnId = currentTurnId.current;
      if (turnId) push({ kind: 'turn-end', turnId });
      push({ kind: 'response', text });
      setIsThinking(false);
    }

    function onSystemError(err: string) {
      const turnId = currentTurnId.current;
      if (turnId) push({ kind: 'turn-end', turnId });
      push({ kind: 'error', text: err });
      setIsThinking(false);
    }

    function onAgentSteered(text: string) {
      push({ kind: 'steered', text });
    }

    function onPermissionRequest(payload: { requestId: string; command: string; timeoutMs: number }) {
      if (!payload?.requestId || !payload?.command) return;
      push({
        kind: 'approval-request',
        requestId: payload.requestId,
        command: payload.command,
      });
    }

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('system-message', onSystemMessage);
    s.on('runtime-config', onRuntimeConfig);
    s.on('agent-status', onAgentStatus);
    s.on('bash-start', onBashStart);
    s.on('bash-stdout', onBashStdout);
    s.on('bash-stderr', onBashStderr);
    s.on('bash-end', onBashEnd);
    s.on('tool-start', onToolStart);
    s.on('tool-end', onToolEnd);
    s.on('agent-response', onAgentResponse);
    s.on('system-error', onSystemError);
    s.on('agent-steered', onAgentSteered);
    s.on('permission-request', onPermissionRequest);

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('system-message', onSystemMessage);
      s.off('runtime-config', onRuntimeConfig);
      s.off('agent-status', onAgentStatus);
      s.off('bash-start', onBashStart);
      s.off('bash-stdout', onBashStdout);
      s.off('bash-stderr', onBashStderr);
      s.off('bash-end', onBashEnd);
      s.off('tool-start', onToolStart);
      s.off('tool-end', onToolEnd);
      s.off('agent-response', onAgentResponse);
      s.off('system-error', onSystemError);
      s.off('agent-steered', onAgentSteered);
      s.off('permission-request', onPermissionRequest);
    };
  }, [socket]);

  const handleSubmit = useCallback((prompt: string) => {
    const s = socket.current;
    if (!s || !isConnected) return;
    push({ kind: 'user', text: prompt });
    const turnId = nextId();
    currentTurnId.current = turnId;
    push({ kind: 'turn-start', turnId });
    setHasStarted(true);
    setIsThinking(true);
    s.emit('user-prompt', prompt);
  }, [socket, isConnected]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: `radial-gradient(circle at 50% 115%, ${sapColors.glow} 0%, ${sapColors.glowSoft} 16%, rgba(0,0,0,0) 34%), ${sapColors.appBackground}`,
      color: sapColors.text,
    }}>
      <Header
        workspacePath={workspacePath}
        modelInfo={providerInfo ? `${providerInfo} · ${modelInfo || '—'}` : modelInfo}
        isConnected={isConnected}
        isThinking={isThinking}
      />
      {!hasStarted
        ? <WelcomeScreen workspacePath={workspacePath} modelInfo={providerInfo ? `${providerInfo} · ${modelInfo}` : modelInfo} />
        : <MessageList messages={messages} onPermissionDecision={handlePermissionDecision} />
      }
      <ChatInput
        onSubmit={handleSubmit}
        disabled={!isConnected}
        isThinking={isThinking}
        currentProvider={providerInfo}
        currentModel={modelInfo}
        onUpdateRuntimeConfig={updateRuntimeConfig}
        onLoadModels={loadModels}
        onExitSession={resetSession}
      />
    </div>
  );
}
