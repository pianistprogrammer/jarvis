import 'dotenv/config'
import path from 'node:path'
import os from 'node:os'

const root = process.cwd()
const requestedProfile = process.env.MODEL_PROFILE
const fullProfile = requestedProfile === 'full' || (requestedProfile !== 'compact' && os.totalmem() >= 32 * 1024 ** 3)

export const config = {
  port: Number(process.env.PORT || 4100),
  llmBaseUrl: (process.env.LLM_BASE_URL || 'http://127.0.0.1:8080/v1').replace(/\/$/, ''),
  llmApiKey: process.env.LLM_API_KEY || 'local-no-key',
  llmModel: process.env.LLM_MODEL || 'qwen-local',
  sttUrl: process.env.STT_URL || 'http://127.0.0.1:8000/v1/audio/transcriptions',
  sttModel: process.env.STT_MODEL || (fullProfile ? 'mlx-community/whisper-large-v3-turbo-asr-fp16' : 'mlx-community/whisper-small-mlx-q4'),
  ttsUrl: process.env.TTS_URL || 'http://127.0.0.1:8000/v1/audio/speech',
  ttsModel: process.env.TTS_MODEL || 'mlx-community/Kokoro-82M-4bit',
  ttsVoice: process.env.TTS_VOICE || 'af_heart',
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
