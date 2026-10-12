export type Role = 'user' | 'assistant' | 'tool';

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

export interface CanonicalMessage {
  role: Role;
  content: ContentBlock[] | string;
}

export interface CompletionRequest {
  model: string;
  maxTokens: number;
  temperature?: number;
  messages: CanonicalMessage[];
  tools?: ToolDefinition[];
}

export interface CompletionResponse {
  stopReason: 'tool_use' | 'end_turn' | 'max_tokens' | string;
  content: ContentBlock[];
  raw?: unknown;
}

export interface LLMClient {
  complete(req: CompletionRequest): Promise<CompletionResponse>;
}

export interface ProviderConfig {
  provider: 'ollama';
  baseURL: string;
  apiKey?: string;
  model: string;
  maxTokens: number;
  temperature: number;
  supportsNativeTools: boolean;
}

export interface SessionState {
  workspace: string;
  history: CanonicalMessage[];
  promptQueue: string[];
  isRunning: boolean;
}
