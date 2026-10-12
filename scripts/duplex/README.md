# Duplex LoRA (MLX)

This module prepares text-only, VAD-free duplex data for an MLX LoRA. The model receives streaming-ASR micro-turns every ~600 ms and outputs either `<listen>` or at most three spoken words.

## Dataset

The generated corpus is stored outside the repository:

```text
/Volumes/AI/Datasets/jarvis-duplex/
├── train.jsonl          # 10,000 MLX-compatible ticks
├── valid.jsonl          # 1,500 held-out ticks
├── test.jsonl           # 1,500 held-out ticks
├── calls_train.jsonl    # call-level source sequences
├── calls_valid.jsonl
└── calls_test.jsonl
```

Each training tick is an MLX completions record:

```json
{"prompt":"user: so, um I have this\nassistant: <listen>\nuser: coffee grinder issue and","completion":"<listen>","tag":"listen_speech","weight":0.3,"callId":12}
```

`tag` and `weight` preserve the simulated-call semantics for analysis. Current `mlx_lm lora` trains from `prompt` and `completion`; it does not consume `weight`.

The corpus simulates call-level streaming behavior: partial ASR fragments, hesitation, silence, assistant continuers, turn starts, short ongoing speech, user backchannels, interruptions, and safe hazard warnings. Calls—not individual ticks—are split between train, validation, and test.

## Generate

```bash
node scripts/duplex/generate-natural-corpus.mjs \
  --out-dir /Volumes/AI/Datasets/jarvis-duplex \
  --train-size 10000 --valid-size 1500 --test-size 1500 --seed 42
```

## Train

`lora-config.json` uses the volume dataset:

```bash
npm run lora:train
```

The smoke configuration remains separate and uses the small local fixture:

```bash
npm run lora:smoke
```

## Runtime contract

- `<listen>`: do not speak; retain the streaming loop.
- Any other completion: synthesize the short phrase immediately.
- A runtime interruption should immediately stop queued TTS and continue collecting user micro-turns.

Keep the latest 20–40 micro-turns, use a small generation limit, and never treat a single silent tick as a completed user turn.
