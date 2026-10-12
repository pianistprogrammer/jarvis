# Qwen3.5-9B with MLX LoRA — Notes

- We switched LoRA base to `Qwen/Qwen3.5-9B` in scripts/duplex/lora-config.json.
- Recommended LoRA targets remain attention `q_proj` and `v_proj` (timing/turn-taking steering), last 4 layers only.
- Qwen3.5 uses "thinking" by default in many templates. For duplex SFT we want short non-thinking outputs — keep temperature low and max_tokens small; in serving frameworks disable thinking if needed (chat_template_kwargs.enable_thinking=false).
- If your MLX build requires an MLX-converted model, we can convert Qwen3.5‑9B to MLX format first; otherwise use HF model id if mlx-lm supports it directly on your setup.
