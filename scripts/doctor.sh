#!/usr/bin/env bash
set -u

failures=0
check_command() {
  if command -v "$1" >/dev/null 2>&1; then echo "✓ $1: $(command -v "$1")"; else echo "✗ missing $1"; failures=$((failures + 1)); fi
}

echo "Jarvis system check"
echo "macOS: $(sw_vers -productVersion 2>/dev/null || echo unknown) · $(uname -m)"
if [[ "$(uname -m)" == "arm64" ]]; then echo "✓ Apple silicon"; else echo "✗ Apple silicon required for local MLX models"; failures=$((failures + 1)); fi
memory_bytes="$(sysctl -n hw.memsize 2>/dev/null || echo 0)"
echo "Unified memory: $((memory_bytes / 1024 / 1024 / 1024)) GB"
check_command node
check_command npm
check_command llama-server
check_command ffmpeg
[[ -x .venv/bin/mlx_audio.server ]] && echo "✓ MLX-Audio virtual environment" || { echo "✗ missing MLX-Audio; run npm run setup:mac"; failures=$((failures + 1)); }
[[ -d node_modules ]] && echo "✓ Node dependencies" || { echo "✗ missing Node dependencies"; failures=$((failures + 1)); }

if curl -fsS --max-time 2 http://127.0.0.1:8080/health >/dev/null 2>&1; then echo "✓ llama.cpp is healthy"; else echo "· llama.cpp is not running"; fi
if curl -fsS --max-time 2 http://127.0.0.1:8000/ >/dev/null 2>&1; then echo "✓ MLX-Audio is healthy"; else echo "· MLX-Audio is not running"; fi

if (( failures )); then echo "$failures required check(s) failed."; exit 1; fi
echo "Required installation checks passed."
