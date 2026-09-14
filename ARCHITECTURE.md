# Architecture

```mermaid
flowchart LR
  Mic[Browser microphone] --> VAD[Local energy VAD]
  VAD -->|16 kHz WAV| API[Node control plane]
  API --> STT[MLX Whisper]
  STT --> Agent[Streaming agent loop]
  Text[Typed input] --> Agent
  Agent --> LLM[llama.cpp + Metal]
  LLM --> Tools[Tool registry]
  Tools --> Files[Scoped files and shell]
  Tools --> Browser[Persistent Playwright Chromium]
  Browser -->|live JPEG| UI[Voice stage]
  LLM -->|text deltas| UI
  UI -->|sentence queue| API
  API --> TTS[MLX Kokoro]
  TTS -->|WAV| UI
```

## Turn lifecycle

1. Browser audio is monitored locally. After 220 ms above the speech threshold, any active response and audio are cancelled (barge-in).
2. After 850 ms of silence, the collected audio is downsampled to mono 16 kHz WAV and sent to MLX Whisper.
3. The transcript enters an OpenAI-compatible streaming chat-completions loop. Tool calls are assembled from deltas, executed, and returned to the model.
4. Assistant text is displayed immediately. Complete sentences are sent to Kokoro while the LLM continues generating. Fetches are queued before ordered playback.
5. Playwright uses a persistent profile. The agent receives a compact page snapshot with stable element references, while the human sees periodic screenshots.

## Memory profile for an 8 GB Mac

The default profile deliberately uses a 4-bit 4B LLM (about 2.5 GB of weights), 4-bit Whisper Small (about 200 MB), and Kokoro 82M (about 700 MB including its voice pack). Keep the LLM context at 4,096 and one inference slot. macOS, Chromium, runtime buffers, and the model frameworks still share unified memory; close memory-heavy applications if pressure rises.

The demo that inspired this project used a Qwen 35B-A3B model and Breeze-TTS-2 on a 12 GB NVIDIA GPU. Those are not drop-in choices for an 8 GB Mac. This project preserves the cascade and interaction design while selecting practical Apple-native runtimes.

## Automatic 48 GB profile

At 32 GB unified memory or above, `scripts/start-models.sh` selects the demo's model family: `unsloth/Qwen3.6-35B-A3B-GGUF:UD-Q4_K_M` (about 22.1 GB) with a 32K context and Metal offload. The application simultaneously selects MLX Whisper Large-v3 Turbo FP16. Kokoro stays the default voice because its small footprint and low first-audio latency are more important to conversational flow than spending spare memory on a slower speech model. Set `MODEL_PROFILE=compact` to force the lighter stack or override any individual endpoint/model in `.env`.
