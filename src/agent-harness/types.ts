// Frontend message types - structured event model replacing raw xterm writes

export type MessageData =
  | { kind: 'status';     text: string }
  | { kind: 'user';       text: string }
  | { kind: 'turn-start'; turnId: string }
  | { kind: 'turn-end';   turnId: string }
  | { kind: 'steered';    text: string }
  | { kind: 'approval-request'; requestId: string; command: string }
  | { kind: 'tool-call';  toolName: string; summary: string; toolId: string }
  | { kind: 'tool-end';   toolId: string; ok: boolean; summary: string; diff?: string }
  | { kind: 'bash-cmd';   command: string; cmdId: string }
  | { kind: 'bash-out';   text: string; stream: 'stdout' | 'stderr'; cmdId: string }
  | { kind: 'bash-end';   exitCode: number; cmdId: string }
  | { kind: 'response';   text: string }
  | { kind: 'error';      text: string };

export interface Message {
  id: string;
  data: MessageData;
}
