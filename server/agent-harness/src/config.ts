import 'dotenv/config';

import type { ProviderConfig } from './types.js';

export const VALID_PROVIDERS = ['ollama'] as const;
const DEFAULT_OLLAMA_MODEL = 'mistral:7b-instruct';

function requireEnv(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (val === undefined) throw new Error(`Missing required env var: ${key}`);
  return val;
}

const provider = requireEnv('LLM_PROVIDER', 'ollama');
if (!VALID_PROVIDERS.includes(provider as typeof VALID_PROVIDERS[number])) {
  throw new Error(`Invalid LLM_PROVIDER "${provider}". Must be one of: ${VALID_PROVIDERS.join(', ')}`);
}

export function isValidProvider(value: string): value is ProviderConfig['provider'] {
  return VALID_PROVIDERS.includes(value as ProviderConfig['provider']);
}

export function getDefaultModelForProvider(value: ProviderConfig['provider']): string {
  if (value !== 'ollama') {
    throw new Error('Only ollama is supported in this app.');
  }
  return DEFAULT_OLLAMA_MODEL;
}

export const config = Object.freeze({
  provider: provider as ProviderConfig['provider'],
  baseURL: requireEnv('LLM_BASE_URL', 'http://localhost:11434/v1'),
  apiKey: process.env['LLM_API_KEY'] ?? '',
  model: requireEnv('LLM_MODEL', DEFAULT_OLLAMA_MODEL),
  maxTokens: parseInt(process.env['LLM_MAX_TOKENS'] ?? '2048', 10),
  temperature: parseFloat(process.env['LLM_TEMPERATURE'] ?? '0.2'),
  supportsNativeTools: (process.env['LLM_SUPPORTS_NATIVE_TOOLS'] ?? 'true') !== 'false',
  port: parseInt(process.env['PORT'] ?? '3001', 10),
  maxIterations: parseInt(process.env['SESSION_MAX_ITERATIONS'] ?? '30', 30),
  toolResultMaxChars: parseInt(process.env['TOOL_RESULT_MAX_CHARS'] ?? '8000', 10),
  commandTimeoutMs: parseInt(process.env['COMMAND_TIMEOUT_MS'] ?? '60000', 10),
} as const);

export function updateRuntimeConfig(
  current: ProviderConfig,
  patch: Partial<Pick<ProviderConfig, 'provider' | 'model'>>,
): ProviderConfig {
  const nextProvider = patch.provider ?? current.provider;
  const nextModel = patch.model?.trim();

  if (patch.provider && !isValidProvider(patch.provider)) {
    throw new Error(`Invalid provider "${patch.provider}". Must be one of: ${VALID_PROVIDERS.join(', ')}`);
  }

  return {
    ...current,
    provider: nextProvider,
    model: nextModel && nextModel.length > 0
      ? nextModel
      : patch.provider && patch.provider !== current.provider
        ? getDefaultModelForProvider(nextProvider)
        : current.model,
  };
}
