# Jarvis — local voice agent for Apple silicon

Jarvis is a near-real-time, voice-first agent that runs on an Apple silicon Mac. It listens hands-free, streams a local model, speaks by sentence, supports interruption, calls tools, and operates a persistent browser you can watch inside the UI.

![Jarvis interface](docs/jarvis-interface.png)

## What is included

- Hands-free microphone capture with local turn detection, echo-cancellation request, and barge-in
- MLX Parakeet speech-to-text through an OpenAI-compatible API
- Qwen3.8 9B Distill through llama.cpp and Metal
- Kokoro speech through MLX-Audio by default, with optional Qwen3-TTS and sentence-level generation/playback overlap
- Streaming OpenAI-compatible tool calls
- Persistent Playwright Chromium with snapshots, click/type tools, optional domain allowlist, and live screenshots
- Workspace-scoped file tools, calculator, time, and a guarded local shell
- Audio-reactive orb, compact tool activity cards, browser panel, typed fallback, and runtime inspector

## Why these models

The [Pithagoras voice demo](https://www.youtube.com/watch?v=xbedfuqYQYA) used a CUDA-focused speech stack, Qwen 35B-A3B through llama.cpp, and Breeze-TTS-2/audio.cpp on an RTX 3060 with 12 GB VRAM. That exact combination is too large for an 8 GB unified-memory Mac.

Jarvis uses the same modular cascade with Apple-native substitutions. It detects unified memory at launch and has compact and full profiles:

| Stage | Default | Why on 8 GB Apple silicon |
| --- | --- | --- |
| Turn detection | Browser Silero VAD | Speech-aware detection and immediate barge-in |
| STT | `mlx-community/parakeet-tdt-0.6b-v3` | Fast local speech recognition |
| LLM | `empero-ai/Qwen3.8-9B-Distill-GGUF:Q4_K_M` | Strong local reasoning with a moderate memory footprint |
| TTS | `mlx-community/Kokoro-82M-4bit` | Fast, consistent local voice; Qwen3-TTS remains available |
| Browser | Playwright Chromium | Persistent profile and deterministic controls |

The 9B Q4_K_M model is used on both compact and full profiles, with a 64K context. Parakeet remains the local speech recognizer.

All adapters are configured in `.env`; hosted OpenAI-compatible LLM/STT/TTS endpoints also work.

## Quick start

Requirements: Apple silicon, macOS, Homebrew, Node.js 20+, and at least 12 GB free disk for the model and caches.

```bash
git clone https://github.com/pianistprogrammer/jarvis.git
cd jarvis
npm run setup:mac
```

For the simplest launch, start the models and production app together:

```bash
npm run launch
```

Or run them separately while developing:

```bash
npm run models:start
# in another terminal
npm run dev
```

Open the URL printed by the launcher, allow microphone access, and speak. The first model use downloads weights and will be slower. The launcher smoke-tests the LLM before starting the app and selects the next free app port if `PORT` (default `4100`) is occupied. Production mode is `npm run build && npm start`, then open port 4100.

The launcher appends output from Jarvis, llama.cpp, MLX-Audio, and browser startup to `logs/app.log`. Component-specific logs remain in `logs/llama-server.log`, `logs/mlx-audio.log`, and `logs/browser.log`.

## Browser use

Ask: “Open Hacker News and summarize the first three stories.” The agent launches a persistent Chromium profile, reads the page, and the browser panel appears automatically. Use `BROWSER_HEADLESS=false` if you also want a native Chromium window for manual sign-in.

For safer navigation, edit `.env`:

```dotenv
BROWSER_ALLOWLIST=github.com,*.wikipedia.org,news.ycombinator.com
```

Install browser binaries separately after a dependency update with `npm run browser:install`.

## Tuning a compact machine

- Keep `LLM_CONTEXT_SIZE=65536`, `--parallel 1`, and the Q4 model in `scripts/start-models.sh`. A 64K KV cache is memory-intensive; lower `LLM_CONTEXT_SIZE` if macOS starts swapping.
- Close Chrome, Docker Desktop, and other memory-heavy apps before starting all models.
- Keep `STT_MODEL=mlx-community/parakeet-tdt-0.6b-v3` for the local STT path.
- Use typed input while testing the LLM independently; the UI remains fully usable with the mic muted.
- If you already run LM Studio or Ollama, point `LLM_BASE_URL` and `LLM_MODEL` at its OpenAI-compatible endpoint and start only MLX-Audio.

Force a profile in `.env` when automatic selection is not what you want:

```dotenv
MODEL_PROFILE=full
# MODEL_PROFILE=compact
```

The repository’s automated checks do not download weights or exercise microphone hardware. See [ARCHITECTURE.md](ARCHITECTURE.md) for the pipeline and [SECURITY.md](SECURITY.md) before signing the browser into accounts.

After setup, `npm run doctor` checks the machine and service health. `npm test`, `npm run check`, `npm run lint`, and `npm run build` verify the tool/browser layer and both TypeScript applications.

## Configuration

Copy `.env.example` to `.env`. Kokoro is the default TTS provider. To switch to Qwen3-TTS, set `TTS_PROVIDER=qwen3-tts`, use the Qwen model and `TTS_VOICE=Ryan` shown in `.env.example`, then relaunch. Set `TTS_PROVIDER=kokoro` with `mlx-community/Kokoro-82M-4bit` and a Kokoro voice such as `af_heart` to switch back. The important options are `LLM_BASE_URL`, `LLM_PORT`, `LLM_MODEL`, `LLM_CONTEXT_SIZE`, `AUDIO_PORT`, `STT_URL`, `STT_MODEL`, `TTS_PROVIDER`, `TTS_URL`, `TTS_MODEL`, `TTS_VOICE`, `TTS_LANG_CODE`, `TTS_INSTRUCT`, `TTS_TEMPERATURE`, `TTS_TOP_P`, `TTS_TOP_K`, `TTS_REPETITION_PENALTY`, `TTS_SPEED`, `TTS_STREAMING_INTERVAL`, `AGENT_WORKSPACE`, and `BROWSER_ALLOWLIST`. `LLM_CONTEXT_SIZE` and the TTS sampling settings are passed through to the local runtimes. `LLM_PORT` defaults to `8180`; `AUDIO_PORT` defaults to `8100`. Models use `JARVIS_MODEL_CACHE` when set, or fall back to `data/model-cache` if the inherited Hugging Face cache is unavailable.

## Attribution

The product concept and visual interaction are inspired by [thecodacus/pithagoras](https://github.com/thecodacus/pithagoras) and Codacus’s linked demo. This repository is an original implementation because the reference repository does not currently publish a software license. Jarvis is MIT licensed; model weights and dependencies retain their own licenses.
