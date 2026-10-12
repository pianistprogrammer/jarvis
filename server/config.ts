import 'dotenv/config'
import path from 'node:path'
import os from 'node:os'

const root = process.cwd()
const requestedProfile = process.env.MODEL_PROFILE
const fullProfile = requestedProfile === 'full' || (requestedProfile !== 'compact' && os.totalmem() >= 32 * 1024 ** 3)
const audioPort = Number(process.env.AUDIO_PORT || 8100)
const llmPort = Number(process.env.LLM_PORT || 8180)
const ttsProvider = process.env.TTS_PROVIDER || 'kokoro'
if (ttsProvider !== 'kokoro' && ttsProvider !== 'qwen3-tts') throw new Error('TTS_PROVIDER must be kokoro or qwen3-tts')
const qwenTts = ttsProvider === 'qwen3-tts'
const audioUrl = (configured: string | undefined, path: string) => configured?.replace('127.0.0.1:8000', `127.0.0.1:${audioPort}`) || `http://127.0.0.1:${audioPort}${path}`
const llmUrl = process.env.LLM_BASE_URL?.replace('127.0.0.1:8080', `127.0.0.1:${llmPort}`) || `http://127.0.0.1:${llmPort}/v1`
const configuredTtsModel = process.env.TTS_MODEL
const configuredTtsVoice = process.env.TTS_VOICE
const ttsModel = qwenTts && configuredTtsModel?.includes('Kokoro') ? undefined : configuredTtsModel
const ttsVoice = qwenTts && configuredTtsVoice === 'af_sky' ? undefined : configuredTtsVoice
const numberSetting = (name: string, fallback: number) => {
  const value = Number(process.env[name] ?? fallback)
  return Number.isFinite(value) ? value : fallback
}

export const config = {
  port: Number(process.env.PORT || 4100),
  llmBaseUrl: llmUrl.replace(/\/$/, ''),
  llmApiKey: process.env.LLM_API_KEY || 'local-no-key',
  llmModel: process.env.LLM_MODEL || 'qwen-local',
  llmContextSize: numberSetting('LLM_CONTEXT_SIZE', 65536),
  sttUrl: audioUrl(process.env.STT_URL, '/v1/audio/transcriptions'),
  sttModel: process.env.STT_MODEL || 'mlx-community/parakeet-tdt-0.6b-v3',
  ttsUrl: audioUrl(process.env.TTS_URL, '/v1/audio/speech'),
  ttsProvider,
  ttsModel: ttsModel || (qwenTts ? 'mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-6bit' : 'mlx-community/Kokoro-82M-4bit'),
  ttsVoice: ttsVoice || (qwenTts ? 'Ryan' : 'af_heart'),
  ttsLangCode: process.env.TTS_LANG_CODE || (qwenTts ? 'English' : 'en'),
  ttsInstruct: process.env.TTS_INSTRUCT ?? (qwenTts ? 'Neutral, clear speech, steady pacing.' : undefined),
  ttsTemperature: numberSetting('TTS_TEMPERATURE', qwenTts ? 0.35 : 0.7),
  ttsTopP: numberSetting('TTS_TOP_P', qwenTts ? 0.9 : 0.95),
  ttsTopK: numberSetting('TTS_TOP_K', qwenTts ? 20 : 40),
  ttsRepetitionPenalty: numberSetting('TTS_REPETITION_PENALTY', qwenTts ? 1.10 : 1.0),
  ttsSpeed: numberSetting('TTS_SPEED', 1.0),
  ttsStreamingInterval: numberSetting('TTS_STREAMING_INTERVAL', qwenTts ? 0.32 : 0.5),
  workspace: path.resolve(process.env.AGENT_WORKSPACE || path.join(root, 'workspace')),
  browserProfile: path.resolve(process.env.BROWSER_PROFILE || path.join(root, 'data/browser-profile')),
  browserCdpUrl: process.env.BROWSER_CDP_URL || 'http://127.0.0.1:9223',
  browserUiUrl: process.env.BROWSER_UI_URL || 'http://127.0.0.1:3010',
  browserUser: process.env.BROWSER_USER || 'agent',
  browserPassword: process.env.BROWSER_PASSWORD || 'jarvis-local',
  browserHeadless: process.env.BROWSER_HEADLESS !== 'false',
  browserAllowlist: (process.env.BROWSER_ALLOWLIST || '').split(',').map((x) => x.trim()).filter(Boolean),
  profile: fullProfile ? 'full' : 'compact',
}
