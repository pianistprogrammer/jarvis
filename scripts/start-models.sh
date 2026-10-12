#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "The bundled model profiles require Apple silicon macOS." >&2
  exit 1
fi
cd "$(dirname "$0")/.."
source scripts/load-env.sh

if [[ ! -x .venv/bin/mlx_audio.server ]]; then
  echo "MLX-Audio is not installed. Run npm run setup:mac first." >&2
  exit 1
fi
if ! command -v llama-server >/dev/null 2>&1; then
  echo "llama-server is not installed. Run npm run setup:mac first." >&2
  exit 1
fi
audio_port="${AUDIO_PORT:-8100}"
llm_port="${LLM_PORT:-8180}"
audio_ready=false
llm_ready=false
if curl -fsS --max-time 2 "http://127.0.0.1:$audio_port/" >/dev/null 2>&1; then audio_ready=true; fi
if curl -fsS --max-time 2 "http://127.0.0.1:$llm_port/health" >/dev/null 2>&1; then llm_ready=true; fi
for port in "$audio_port" "$llm_port"; do
  if [[ "$port" == "$audio_port" && "$audio_ready" == true ]] || [[ "$port" == "$llm_port" && "$llm_ready" == true ]]; then continue; fi
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is already in use. Stop that service or point Jarvis at it in .env." >&2
    exit 1
  fi
done

memory_bytes="$(sysctl -n hw.memsize)"
profile="${MODEL_PROFILE:-auto}"
context="${LLM_CONTEXT_SIZE:-65536}"
if ! [[ "$context" =~ ^[0-9]+$ ]] || (( context < 4096 )); then
  echo "LLM_CONTEXT_SIZE must be an integer of at least 4096." >&2
  exit 1
fi
if [[ "$profile" == "auto" ]]; then
  if (( memory_bytes >= 34359738368 )); then profile="full"; else profile="compact"; fi
fi

case "$profile" in
  compact)
    model_ref="empero-ai/Qwen3.8-9B-Distill-GGUF:Q4_K_M"
    disk_need_gb=12
    ;;
  full)
    model_ref="empero-ai/Qwen3.8-9B-Distill-GGUF:Q4_K_M"
    disk_need_gb=12
    ;;
  *) echo "MODEL_PROFILE must be auto, compact, or full." >&2; exit 1 ;;
esac

available_kb="$(df -Pk . | awk 'NR==2 {print $4}')"
if (( available_kb < disk_need_gb * 1024 * 1024 )); then
  echo "The $profile profile needs at least ${disk_need_gb} GB free for models and caches." >&2
  exit 1
fi

model_cache="${JARVIS_MODEL_CACHE:-${HF_HOME:-$PWD/data/model-cache}}"
if ! mkdir -p "$model_cache" 2>/dev/null || [[ ! -w "$model_cache" ]]; then
  model_cache="$PWD/data/model-cache"
  mkdir -p "$model_cache"
fi
export HF_HOME="$model_cache"
export HF_HUB_CACHE="$model_cache/hub"

mkdir -p logs
app_log="${APP_LOG:-logs/app.log}"
pids=()
cleanup() {
  for pid in "${pids[@]:-}"; do kill "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT INT TERM

echo "Selected $profile profile for $((memory_bytes / 1024 / 1024 / 1024)) GB unified memory."
start_llm() {
  local model="$1"
  echo "Starting $model with Metal on port ${llm_port}…"
  llama-server \
    -hf "$model" \
    --alias qwen-local \
    --host 127.0.0.1 --port "$llm_port" \
    --ctx-size "$context" --batch-size 512 --ubatch-size 256 --parallel 1 --n-gpu-layers 999 --jinja --flash-attn on \
    > >(tee -a logs/llama-server.log "$app_log") 2>&1 &
  pids+=("$!")
}

llm_pid=""
audio_pid=""
if [[ "$llm_ready" == false ]]; then
  start_llm "$model_ref"
  llm_pid="${pids[0]}"
else
  echo "Reusing healthy llama.cpp on port $llm_port"
fi

if [[ "$audio_ready" == false ]]; then
echo "Starting MLX-Audio (Parakeet + ${TTS_PROVIDER:-kokoro}) on port ${audio_port}…"
.venv/bin/mlx_audio.server --host 127.0.0.1 --port "$audio_port" \
  > >(tee -a logs/mlx-audio.log "$app_log") 2>&1 &
audio_pid="$!"
pids+=("$audio_pid")
else
  echo "Reusing healthy MLX-Audio on port $audio_port"
fi

wait_for_service() {
  local name="$1" url="$2" pid="$3" attempts=0
  until curl -fsS --max-time 2 "$url" >/dev/null 2>&1; do
    if [[ -n "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; then
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

wait_for_service "MLX-Audio" "http://127.0.0.1:$audio_port/" "$audio_pid"
wait_for_service "llama.cpp" "http://127.0.0.1:$llm_port/health" "$llm_pid"
if ! curl -fsS --max-time 180 -X POST "http://127.0.0.1:$llm_port/v1/chat/completions" \
  -H 'Content-Type: application/json' \
  --data '{"model":"qwen-local","messages":[{"role":"user","content":"Reply exactly OK"}],"max_tokens":8,"temperature":0,"stream":false,"chat_template_kwargs":{"enable_thinking":false}}' \
  >/dev/null; then
  echo "$model_ref failed its inference smoke test." >&2
  exit 1
fi
echo "All model services are healthy. Keep this terminal open and run npm run dev in another."
wait
