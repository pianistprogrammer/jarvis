# Run LoRA (MLX) — Quickstart

1) Build micro-turn data
```
node scripts/duplex/build-duplex-data.mjs \
  --in data/raw/chats.jsonl \
  --out data/duplex/train.jsonl \
  --dev-out data/duplex/dev.jsonl
```

2) Install MLX LM
```
pip install mlx-lm
```

3) Train adapters
```
mlx_lm.lora \
  --model mlx-community/Mistral-7B-Instruct-v0.3-4bit \
  --train --data data/duplex \
  --iters 4000 --batch-size 16 \
  --learning-rate 1e-5 --mask-prompt
```

4) Use adapters in your loop
```
mlx_lm.generate \
  --model mlx-community/Mistral-7B-Instruct-v0.3-4bit \
  --adapter adapters \
  --prompt "user: hello" --max-tokens 24 --temp 0.2
```

5) Fuse (optional)
```
mlx_lm.fuse \
  --model mlx-community/Mistral-7B-Instruct-v0.3-4bit \
  --adapter-path adapters \
  --save-path models/mistral-7b-duplex-4bit
```
