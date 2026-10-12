# Duplex LoRA (MLX) — Data + Training

This module prepares micro-turn SFT data and runs a small LoRA on an MLX model to teach duplex behavior (LISTEN vs short speech) for full-duplex voice loops.

## Overview
- Data builder: turns normal dialogues into 600 ms “micro-turns” with tags:
  - `[NO_VOICE]` for silent slice
  - `LISTEN` for assistant stay-silent turn
  - Short speech (≤6 words) for assistant speaking turns
- Trainer: runs `mlx_lm.lora` on a 7B MLX model (quantized) with balanced targets
- Inference: load adapters in your voice loop; keep `n_predict` small and trim LISTEN-only turns from history

## Install
```bash
pip install mlx-lm whispermlx sounddevice
# Piper TTS installed separately if you want to run the loop end-to-end
```

## Data Format
Input: chat JSONL (one per line):
```json
{"messages": [{"role":"user","content":"…"},{"role":"assistant","content":"…"}, ...]}
```

Output: SFT JSONL (instruction-style) where each record is one micro-turn:
```json
{"input":"<history>\nuser: hello [NO_VOICE]","output":"LISTEN"}
{"input":"<history>\nuser: the grinder is jamming","output":"Try coarser grind"}
```

## Commands
- Build data (train/dev):
```bash
node scripts/duplex/build-duplex-data.mjs \
  --in data/raw/chats.jsonl \
  --out data/duplex/train.jsonl \
  --dev-out data/duplex/dev.jsonl \
  --slice-ms 600 --min-user-tok 1 --max-user-tok 7 \
  --listen-ratio 0.7 --max-phrase-words 6
```

- LoRA train (example):
```bash
mlx_lm.lora \
  --model mlx-community/Mistral-7B-Instruct-v0.3-4bit \
  --train --data data/duplex \
  --iters 4000 --batch-size 16 \
  --learning-rate 1e-5 --mask-prompt
```

- Inference with adapters:
```bash
mlx_lm.generate \
  --model mlx-community/Mistral-7B-Instruct-v0.3-4bit \
  --adapter adapters \
  --prompt "…" --max-tokens 24 --temp 0.2
```

- Fuse (optional):
```bash
mlx_lm.fuse \
  --model mlx-community/Mistral-7B-Instruct-v0.3-4bit \
  --adapter-path adapters \
  --save-path models/mistral-7b-duplex-4bit
```

## System Prompt (suggested)
```
You are a full‑duplex voice assistant. Every ~600 ms you receive a slice of the mic.
Rules:
- If user is still speaking, reply exactly: LISTEN
- If it’s your turn, reply with a short natural phrase (<=6 words). No trailing punctuation if you will continue.
- On “wait/hold on/stop”, reply LISTEN and stop speaking.
- Never echo the user. Use [NO_VOICE] to indicate silence slices.
```

## Notes
- Balance LISTEN vs speech in data (e.g., 60–80% LISTEN) to avoid LISTEN‑spiral or talk‑over.
- Keep history short (last 20–40 micro‑turns) and drop LISTEN‑only assistant turns at runtime.
- Use small `max_tokens` at inference to keep phrases brief.
