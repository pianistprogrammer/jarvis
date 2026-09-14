#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "The bundled model profiles require Apple silicon macOS." >&2
  exit 1
fi
[[ -f .env ]] && set -a && source .env && set +a

if [[ ! -x .venv/bin/mlx_audio.server ]]; then
  echo "MLX-Audio is not installed. Run npm run setup:mac first." >&2
  exit 1
fi
if ! command -v llama-server >/dev/null 2>&1; then
  echo "llama-server is not installed. Run npm run setup:mac first." >&2
  exit 1
fi
for port in 8000 8080; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is already in use. Stop that service or point Jarvis at it in .env." >&2
    exit 1
  fi
done

memory_bytes="$(sysctl -n hw.memsize)"
profile="${MODEL_PROFILE:-auto}"
if [[ "$profile" == "auto" ]]; then
  if (( memory_bytes >= 34359738368 )); then profile="full"; else profile="compact"; fi
fi

case "$profile" in
  compact)
    model_ref="Qwen/Qwen3-4B-GGUF:Q4_K_M"
    context=4096
    disk_need_gb=7
    ;;
  full)
    model_ref="unsloth/Qwen3.6-35B-A3B-GGUF:UD-Q4_K_M"
    context=32768
    disk_need_gb=32
    ;;
  *) echo "MODEL_PROFILE must be auto, compact, or full." >&2; exit 1 ;;
esac

available_kb="$(df -Pk . | awk 'NR==2 {print $4}')"
if (( available_kb < disk_need_gb * 1024 * 1024 )); then
  echo "The $profile profile needs at least ${disk_need_gb} GB free for models and caches." >&2
  exit 1
fi

mkdir -p logs
pids=()
cleanup() {
  for pid in "${pids[@]:-}"; do kill "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT INT TERM

echo "Selected $profile profile for $((memory_bytes / 1024 / 1024 / 1024)) GB unified memory."
echo "Starting $model_ref with Metal on port 8080…"
llama-server \
  -hf "$model_ref" \
  --alias qwen-local \
  --host 127.0.0.1 --port 8080 \
  --ctx-size "$context" --parallel 1 --n-gpu-layers 999 --jinja --flash-attn on \
  >logs/llama-server.log 2>&1 &
pids+=("$!")

echo "Starting MLX-Audio (Whisper + Kokoro) on port 8000…"
.venv/bin/mlx_audio.server --host 127.0.0.1 --port 8000 \
  >logs/mlx-audio.log 2>&1 &
pids+=("$!")

wait_for_service() {
  local name="$1" url="$2" pid="$3" attempts=0
  until curl -fsS --max-time 2 "$url" >/dev/null 2>&1; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "$name stopped during startup. See its log under logs/." >&2
      exit 1
    fi
    attempts=$((attempts + 1))
    if (( attempts % 15 == 0 )); then echo "Still preparing $name (model downloads can take a while)…"; fi
    if (( attempts >= 1800 )); then echo "$name did not become healthy within 30 minutes." >&2; exit 1; fi
    sleep 1
  done
  echo "$name is ready."
}

wait_for_service "MLX-Audio" "http://127.0.0.1:8000/" "${pids[1]}"
wait_for_service "llama.cpp" "http://127.0.0.1:8080/health" "${pids[0]}"
echo "All model services are healthy. Keep this terminal open and run npm run dev in another."
wait
