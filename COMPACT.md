# Jarvis compact profile (8 GB unified memory)

The compact branch keeps the complete application and scales only the inference layer:

| Component | Compact choice | Approximate weight size |
| --- | --- | --- |
| LLM | Qwen3 4B, Q4_K_M, Metal | 2.5 GB |
| Context | 4,096 tokens, one slot, Q8 KV cache | bounded |
| STT | Whisper Tiny English MLX 4-bit | 26 MB |
| TTS | KittenTTS Nano 0.8 MLX FP16, Leo voice | about 62 MB |
| Browser | One persistent headless Chromium context | workload-dependent |

The browser, file/shell tools, streaming tool-call loop, sentence speech queue, barge-in, and UI are unchanged.

On the 8 GB development Mac, a warm KittenTTS request produced 3.23 seconds of audio in 0.75 seconds. The same short warm request through Kokoro took 6.64 seconds for 2.35 seconds of audio, so the compact branch uses KittenTTS to stay comfortably faster than playback. These are local samples, not universal latency guarantees.

## Install and run

```bash
npm run setup:mac
npm run launch:compact
```

The first run downloads model weights. Close other browsers, Docker Desktop, and memory-heavy applications. The compact default is English; for multilingual speech, use `mlx-community/whisper-small-asr-6bit` and clear `STT_LANGUAGE`, accepting higher latency and memory use.

Run `npm run doctor` in another terminal to inspect installation and endpoint health.
