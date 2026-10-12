import { useEffect, useRef } from 'react';
import type { Message } from '../types';
import { UserMessage } from './messages/UserMessage';
import { AgentResponse } from './messages/AgentResponse';
import { BashBlock } from './messages/BashBlock';
import { ToolBlock } from './messages/ToolBlock';
import { StatusLine } from './messages/StatusLine';
import { ThinkingGroup } from './ThinkingGroup';
import { sapColors } from '../theme';

interface MessageListProps {
  messages: Message[];
  onPermissionDecision: (requestId: string, approved: boolean, command: string) => void;
}

interface BashEntry {
  cmd: Message & { data: { kind: 'bash-cmd'; command: string; cmdId: string } };
  outputs: Array<Message & { data: { kind: 'bash-out'; text: string; stream: 'stdout' | 'stderr'; cmdId: string } }>;
  end: (Message & { data: { kind: 'bash-end'; exitCode: number; cmdId: string } }) | null;
}

interface ToolEntry {
  call: Message & { data: { kind: 'tool-call'; toolName: string; summary: string; toolId: string } };
  end: (Message & { data: { kind: 'tool-end'; toolId: string; ok: boolean; summary: string; diff?: string } }) | null;
}

export function MessageList({ messages, onPermissionDecision }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Index bash entries
  const cmdMap = new Map<string, BashEntry>();
  const toolMap = new Map<string, ToolEntry>();
  for (const msg of messages) {
    if (msg.data.kind === 'bash-cmd') {
      cmdMap.set(msg.data.cmdId, { cmd: msg as never, outputs: [], end: null });
    } else if (msg.data.kind === 'bash-out') {
      cmdMap.get(msg.data.cmdId)?.outputs.push(msg as never);
    } else if (msg.data.kind === 'bash-end') {
      const e = cmdMap.get(msg.data.cmdId);
      if (e) e.end = msg as never;
    } else if (msg.data.kind === 'tool-call') {
      toolMap.set(msg.data.toolId, { call: msg as never, end: null });
    } else if (msg.data.kind === 'tool-end') {
      const e = toolMap.get(msg.data.toolId);
      if (e) e.end = msg as never;
    }
  }

  // Group messages into segments: each user prompt spawns a "turn" group
  // Structure: [...top-level items, { turnId, done, items: [...] }, ...]
  type TopItem = { type: 'top'; msg: Message };
  type TurnGroup = { type: 'turn'; turnId: string; done: boolean; items: Message[] };
  type Segment = TopItem | TurnGroup;

  const segments: Segment[] = [];
  let currentTurn: TurnGroup | null = null;

  for (const msg of messages) {
    if (msg.data.kind === 'bash-out' || msg.data.kind === 'bash-end' || msg.data.kind === 'tool-end') continue;

    if (msg.data.kind === 'turn-start') {
      currentTurn = { type: 'turn', turnId: msg.data.turnId, done: false, items: [] };
      segments.push(currentTurn);
    } else if (msg.data.kind === 'turn-end') {
      if (currentTurn && currentTurn.turnId === msg.data.turnId) {
        currentTurn.done = true;
        currentTurn = null;
      }
    } else if (currentTurn) {
      currentTurn.items.push(msg);
    } else {
      segments.push({ type: 'top', msg });
    }
  }

  function renderMsg(msg: Message) {
    switch (msg.data.kind) {
      case 'user':
        return <UserMessage key={msg.id} text={msg.data.text} />;
      case 'response':
        return <AgentResponse key={msg.id} text={msg.data.text} />;
      case 'status':
        return <StatusLine key={msg.id} text={msg.data.text} />;
      case 'bash-cmd': {
        const entry = cmdMap.get(msg.data.cmdId);
        if (!entry) return null;
        return <BashBlock key={msg.id} cmdMessage={entry.cmd} outputs={entry.outputs} end={entry.end} />;
      }
      case 'tool-call': {
        const entry = toolMap.get(msg.data.toolId);
        if (!entry) return null;
        return <ToolBlock key={msg.id} callMessage={entry.call} end={entry.end} />;
      }
      case 'steered':
        return (
          <div key={msg.id} style={{
            fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            fontSize: '12px',
            color: sapColors.textTrace,
            padding: '10px 14px',
            display: 'flex',
            gap: '6px',
            alignItems: 'center',
            backgroundColor: sapColors.surface,
            border: `1px solid ${sapColors.borderSoft}`,
            borderRadius: '12px',
          }}>
            <span style={{ color: sapColors.accentBright, userSelect: 'none' }}>↪</span>
            <span style={{ fontStyle: 'italic' }}>{msg.data.text}</span>
          </div>
        );
      case 'approval-request':
        {
          const data = msg.data;
        return (
          <div key={msg.id} style={{
            fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            fontSize: '12px',
            color: sapColors.text,
            padding: '12px 14px',
            lineHeight: '1.5',
            backgroundColor: sapColors.surface,
            border: `1px solid ${sapColors.border}`,
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}>
            <div style={{ color: sapColors.textDim }}>
              permission required before running command:
            </div>
            <div style={{
              color: sapColors.accentBright,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {msg.data.command}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => onPermissionDecision(data.requestId, true, data.command)}
                style={{
                  border: `1px solid ${sapColors.border}`,
                  borderRadius: '8px',
                  padding: '6px 10px',
                  background: sapColors.surfaceRaised,
                  color: sapColors.text,
                  cursor: 'pointer',
                }}
              >
                Approve
              </button>
              <button
                onClick={() => onPermissionDecision(data.requestId, false, data.command)}
                style={{
                  border: `1px solid ${sapColors.dangerBorder}`,
                  borderRadius: '8px',
                  padding: '6px 10px',
                  background: sapColors.dangerSoft,
                  color: sapColors.dangerBright,
                  cursor: 'pointer',
                }}
              >
                Reject
              </button>
            </div>
          </div>
        );
        }
      case 'error':
        return (
          <div key={msg.id} style={{
            fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            fontSize: '12px',
            color: sapColors.dangerBright,
            padding: '10px 14px',
            lineHeight: '1.5',
            backgroundColor: sapColors.dangerSoft,
            border: `1px solid ${sapColors.dangerBorder}`,
            borderRadius: '12px',
          }}>
            ✖ {msg.data.text}
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '24px 24px 16px',
      scrollbarWidth: 'thin',
      scrollbarColor: `${sapColors.border} transparent`,
    }}>
      <div style={{ maxWidth: '980px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {segments.map((seg, i) => {
        if (seg.type === 'top') return renderMsg(seg.msg);

        const toolCount = seg.items.filter(m => m.data.kind === 'bash-cmd' || m.data.kind === 'tool-call').length;

        return (
          <ThinkingGroup key={seg.turnId + i} done={seg.done} toolCount={toolCount}>
            {seg.items.map(renderMsg)}
          </ThinkingGroup>
        );
      })}
      <div ref={bottomRef} />
      </div>
    </div>
  );
}
