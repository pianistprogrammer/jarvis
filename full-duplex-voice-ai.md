# Full‑Duplex Voice AI (local LLM) — Replication Guide

Replicates the video demo: a normal local text LLM “speaks and listens at the same time” via ultra‑short micro‑turns — no VAD, no special speech‑to‑speech model.

Note: This guide distills the approach shown in the referenced video into a reproducible plan with concrete commands, wiring, and training tips. It assumes Linux/Windows with CUDA GPUs; adapt paths for macOS/CPU as needed.


## Outcome
- A real‑time voice assistant that:
  - Streams mic audio → incremental STT every ~600 ms (slice window).
  - Feeds each slice to a text LLM (e.g., Qwen 3.6‑35B‑A3B in llama.cpp, GGUF) as a “micro‑turn”.
  - LLM outputs either:
    - A short phrase to speak next, or
    - A control token: `LISTEN` (stay quiet, keep listening to user).
  - TTS speaks phrases while new mic slices keep flowing into the LLM — feels full‑duplex.
- No VAD. Turn boundaries are governed by the LLM’s `LISTEN` decisions.


## Architecture
- Mic → Streaming STT (e.g., faster‑whisper/whisper.cpp) → 600 ms text slices
- Loop (every ~600 ms):
  - Append: user_slice (or special tag if empty)
  - LLM response → either short text to say or `LISTEN`
  - If text → TTS speaks (non‑blocking); if `LISTEN` → continue
- Playback: low‑latency TTS (e.g., Piper/Tortoise‑fast/Coqui‑XTTS)
- LLM: llama.cpp serving GGUF model; optional LoRA for duplex behavior

```
Microphone ──▶ STT(window=600ms) ──▶ [user slice]
                                   │
                                   ▼
                              Prompt + history ──▶ LLM ──▶ { text | LISTEN }
                                                      │
                                                      └─▶ TTS (if text)
```


## Requirements
- GPU: single RTX 3060 12GB (works in the video); CPU paths possible at lower quality/latency.
- Python 3.10+
- FFmpeg/PortAudio (for mic I/O)
- Tools:
  - llama.cpp (GGUF runtime)
  - Qwen 3.6‑35B‑A3B GGUF (or similar 30‑40B text‑only model; smaller works with quality tradeoffs)
  - faster‑whisper or whisper.cpp for streaming STT
  - Piper (or Coqui‑XTTS) for TTS


## Setup

### 1) llama.cpp + model
```
# Build
git clone https://github.com/ggerganov/llama.cpp
cd llama.cpp && mkdir build && cd build
cmake .. -DLLAMA_CUBLAS=ON && cmake --build . -j

# Get a Qwen 3.6 35B A3B GGUF (example; pick quant that fits 12GB, e.g., Q5_K_M)
# Place at ~/models/qwen3.6-35b-a3b/Qwen3.6-35B-A3B.Q5_K_M.gguf

# Test simple chat
./bin/llama-simple -m ~/models/qwen3.6-35b-a3b/Qwen3.6-35B-A3B.Q5_K_M.gguf -p "Hello"
```

Optional (server):
```
./bin/llama-server -m ~/models/...gguf -c 4096 -ngl 99 -no-mmap
# Serves HTTP/websocket; client can stream tokens.
```

### 2) Streaming STT (choose one)
- faster‑whisper (Python): good quality/latency.
```
pip install faster-whisper sounddevice
```

### 3) TTS (choose one)
- Piper (fast, local): https://github.com/rhasspy/piper
```
# Install piper; download a voice model, e.g., en_US-lessac-high.onnx
piper --model ~/voices/en_US-lessac-high.onnx --help
```
- Or Coqui‑XTTS v2 (Python): higher quality, a bit heavier.


## Micro‑turn Loop (600 ms)

Key idea: time‑slice conversation; each 600 ms window becomes one “turn”. LLM either speaks a few words or returns `LISTEN`.

Control tokens:
- `LISTEN` → do not speak this turn
- Optional: `STOP` → cease current speech immediately
- Optional: `NO_VOICE` tag for empty input slice

System prompt template:
```
You are a full‑duplex voice assistant. Every 600 ms you receive a slice of what the mic heard.
Rules:
- If the user is still talking or has not finished a thought, reply exactly with: LISTEN
- If it is your turn to speak, reply with a short natural phrase (<= 6 words). No punctuation if you continue next turn.
- If user says “wait”, “hold on”, or interrupts, reply LISTEN immediately and stop speaking.
- Never echo the user text. Never add extra markers unless LISTEN is intended.
- Keep responses brief and conversational; continue thoughts over multiple turns.
Special tags you may see:
- [NO_VOICE] means silence in that slice. You may continue your previous phrase.
```

User slice format (examples):
- Normal: `user: "…partial transcript…"`
- Silence: `user: [NO_VOICE]`

Response examples:
- `LISTEN`
- `That creates toxic gas` (spoken)


## Reference Python Skeleton

```python
import time
import queue
import sounddevice as sd
from faster_whisper import WhisperModel
import requests

SLICE_MS = 600

# 1) Audio capture + streaming STT
model = WhisperModel("small", compute_type="int8_float16")

audio_q = queue.Queue()

def on_audio(indata, frames, time_info, status):
    audio_q.put(bytes(indata))

sd.RawInputStream(samplerate=16000, channels=1, dtype='int16', callback=on_audio).start()

# naive slicer; in practice use ring buffer and VAD-free chunking by time
buf = b""
last_slice = time.time()

# 2) LLM chat state
history = [
    {"role":"system","content":SYSTEM_PROMPT}
]

# 3) TTS function (Piper example)
import subprocess

def speak(text: str):
    if not text.strip() or text.strip().upper()=="LISTEN":
        return
    p = subprocess.Popen(["piper", "--model", "~/voices/en_US-lessac-high.onnx"], stdin=subprocess.PIPE)
    p.communicate(input=text.encode("utf-8"))

# 4) LLM call (llama.cpp server)
LLM_URL = "http://localhost:8080/completion"  # adjust to llama-server endpoint

def llm_reply(messages):
    # minimal OpenAI-compatible payload if using llama.cpp server in compat mode
    payload = {
        "prompt": format_chat(messages),
        "temperature": 0.6,
        "n_predict": 40,
        "stop": ["\nuser:", "\nassistant:"],
    }
    r = requests.post(LLM_URL, json=payload, timeout=10)
    r.raise_for_status()
    return r.json()["content"]

# 5) Main loop
while True:
    try:
        chunk = audio_q.get(timeout=0.05)
        buf += chunk
    except queue.Empty:
        pass

    if (time.time() - last_slice) * 1000 >= SLICE_MS:
        last_slice = time.time()
        # transcribe the buffered audio slice
        if len(buf) == 0:
            user_text = "[NO_VOICE]"
        else:
            segments, _ = model.transcribe(buf, beam_size=1, vad_filter=False)
            user_text = " ".join([s.text for s in segments]).strip() or "[NO_VOICE]"
        buf = b""

        # append user slice
        history.append({"role":"user","content":f"user: {user_text}"})

        # call LLM
        text = llm_reply(history).strip()

        # append assistant turn
        history.append({"role":"assistant","content":text})

        # speak if not LISTEN
        if text.upper() != "LISTEN":
            speak(text)

        # history hygiene: limit growth and avoid LISTEN spiral
        # keep last N turns; optionally drop pure LISTEN assistant turns
        MAX_TURNS = 40
        if len(history) > MAX_TURNS:
            # keep system + last (MAX_TURNS-1)
            history = [history[0]] + history[-(MAX_TURNS-1):]
            # optional: filter assistant LISTEN-only
            history = [m for m in history if not (m["role"]=="assistant" and m["content"].strip().upper()=="LISTEN")]
```

Notes:
- For true streaming, use llama.cpp websocket streaming and start TTS even before the line ends.
- Keep `n_predict` small to encourage short phrases.
- History hygiene is critical: don’t let many `LISTEN` entries bias the next reply to always listen.


## Practical Tips
- Slice length: 400–800 ms. 600 ms felt smooth in the demo; tune per latency.
- Silence tag: explicitly send `[NO_VOICE]` when the slice contains nothing — lets the model continue fluently.
- Interruptions: watch for user tokens like “wait/hold on/stop,” and either inject `STOP` or truncate current TTS.
- TTS buffering: speak non‑blocking; queue segments so playback doesn’t delay the loop.
- Cache: if you rewrite large parts of the history each turn, you’ll blow the KV/prompt cache; change as little as possible.


## Fine‑Tuning (LoRA) for Duplex Behavior
The prompt alone partially works. To improve “when to LISTEN vs speak,” apply a small LoRA to the last 4 layers and precompute earlier activations to fit on 2×RTX 3060 12GB.

Strategy (as in the video):
1) Choose a 35B model with ~40 layers.
2) Freeze first 36 layers; train only last 4 with LoRA (~3.9M params).
3) Precompute a cache:
   - Run each training example once through llama.cpp, dump the layer‑36 activations.
   - Save to disk; training then loads these and only runs the top 4 layers in PyTorch.
4) Verify your PT top‑4 matches llama.cpp outputs (cosine ~0.999+).
5) Train on micro‑turn transcripts: inputs of 600 ms slices with references of `LISTEN` vs short phrases.
6) Export LoRA and apply at runtime via llama.cpp (LoRA support).

Pseudo commands:
```
# Dump activations (custom patch or use llama.cpp dump hooks)
llama-dump-acts \
  -m Qwen3.6-35B-A3B.Q5.gguf \
  --layer-cut 36 \
  --data train_slices.jsonl \
  --out acts_layer36.bin

# Train top-4 layers with LoRA in PyTorch (custom script)
python train_top4_lora.py \
  --acts acts_layer36.bin \
  --lora-r 8 --lora-alpha 16 --epochs 2 --lr 5e-5

# Run with LoRA in llama.cpp
./bin/llama-simple -m ...gguf --lora my_duplex.lora -p "..."
```

Data generation: synthesize micro‑turn dialogues where the assistant alternates `LISTEN` and short phrases based on partial user speech; add real conversational recordings for robustness.


## Evaluation
- Scripts to simulate user streams with interjections (“mhm”, “wait”), long pauses, rapid speech.
- KPIs: response latency per turn, rate of false talk‑over, time‑to‑interrupt, WER impact under playback.
- Subjective feel: does it sound like simultaneous talk? Adjust slice size and `n_predict` accordingly.


## Troubleshooting
- Model talks over user constantly: increase `LISTEN` bias via prompt examples; lower `n_predict`; trim assistant history to drop LISTEN‑only turns.
- Model never speaks: ensure not overfitting to `LISTEN` in history; add positive examples; reset state periodically.
- Latency > 600 ms: shrink context, pre‑tokenize prompts, use faster quant (Q5_K_M/Q4_K_M), ensure STT fast model.
- Audio echo: route TTS output to a different device/virtual sink so STT doesn’t hear itself; or use echo cancellation.


## Minimal Checklist
- [ ] Build llama.cpp with CUDA, serve GGUF model
- [ ] Install faster‑whisper; wire mic stream to 600 ms slices
- [ ] Implement micro‑turn loop and system prompt with `LISTEN`
- [ ] Add non‑blocking TTS playback
- [ ] Trim/clean history to avoid LISTEN spiral
- [ ] Optional: LoRA fine‑tune top‑4 layers with precomputed activations
- [ ] Test interrupts, back‑channeling (“mhm”), silence handling


## References
- Duplex cascade / interaction model concept (micro‑turns ~200–600 ms)
- Qwen 3.6 35B A3B (GGUF) via llama.cpp
- faster‑whisper, whisper.cpp (streaming STT)
- Piper / Coqui‑XTTS (local TTS)

This document is a practical replication playbook; adapt model sizes and tools to your hardware and language requirements.