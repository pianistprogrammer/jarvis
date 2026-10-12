#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/load-env.sh
mkdir -p logs
exec > >(tee -a logs/app.log) 2>&1
audio_port="${AUDIO_PORT:-8100}"
llm_port="${LLM_PORT:-8180}"
app_port="${PORT:-4100}"
stt_model="${STT_MODEL:-mlx-community/parakeet-tdt-0.6b-v3}"
tts_provider="${TTS_PROVIDER:-kokoro}"
if [[ "$tts_provider" == "kokoro" ]]; then
  tts_model="${TTS_MODEL:-mlx-community/Kokoro-82M-4bit}"
else
  tts_model="${TTS_MODEL:-mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-6bit}"
  if [[ "$tts_model" == *Kokoro* ]]; then tts_model="mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-6bit"; fi
fi

if curl -fsS --max-time 2 "http://127.0.0.1:$app_port/api/health" >/dev/null 2>&1 \
  && curl -fsS --max-time 2 "http://127.0.0.1:$audio_port/" >/dev/null 2>&1 \
  && curl -fsS --max-time 2 "http://127.0.0.1:$llm_port/health" >/dev/null 2>&1; then
  echo "Jarvis is already running at http://127.0.0.1:$app_port"
  exit 0
fi

app_ready=false
if curl -fsS --max-time 2 "http://127.0.0.1:$app_port/api/health" >/dev/null 2>&1; then app_ready=true; fi
while [[ "$app_ready" == false ]] && lsof -nP -iTCP:"$app_port" -sTCP:LISTEN >/dev/null 2>&1; do
  app_port=$((app_port + 1))
done
export PORT="$app_port"

model_pid=""
browser_pid=""
models_ready=false
cleanup() {
  [[ -n "$model_pid" ]] && kill "$model_pid" 2>/dev/null || true
  [[ -n "$browser_pid" ]] && kill "$browser_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

if [[ "$app_ready" == false ]]; then npm run build; fi
if curl -fsS --max-time 2 "http://127.0.0.1:$audio_port/" >/dev/null 2>&1 && curl -fsS --max-time 2 "http://127.0.0.1:$llm_port/health" >/dev/null 2>&1; then
  models_ready=true
  echo "Reusing healthy model services on ports $audio_port and $llm_port"
else
  scripts/start-models.sh &
  model_pid="$!"
fi
if curl -fsS --max-time 2 http://127.0.0.1:9223/json/version >/dev/null 2>&1; then
  echo "Reusing running browser on http://127.0.0.1:9223"
else
  scripts/start-browser.sh > >(tee -a logs/browser.log logs/app.log) 2>&1 &
  browser_pid="$!"
fi

echo "Waiting for local inference services…"
warm_model() {
  local name="$1"
  echo "Loading $name before starting Jarvis…"
  curl -fsS --max-time 1800 -X POST --get --data-urlencode "model_name=$name" "http://127.0.0.1:$audio_port/v1/models" >/dev/null
}

for _ in $(seq 1 1800); do
  if [[ "$models_ready" == false ]] && ! kill -0 "$model_pid" 2>/dev/null; then
    wait "$model_pid" || true
    echo "Model launcher stopped. Review logs/ before retrying." >&2
    exit 1
  fi
  if curl -fsS --max-time 2 "http://127.0.0.1:$audio_port/" >/dev/null 2>&1 && curl -fsS --max-time 2 "http://127.0.0.1:$llm_port/health" >/dev/null 2>&1; then
    warm_model "$stt_model"
    warm_model "$tts_model"
    echo "Speech models are loaded."
    echo "Opening Jarvis at http://127.0.0.1:$app_port"
    if [[ "$app_ready" == true ]]; then
      echo "Reusing the running Jarvis app. Keep this terminal open for the recovered services."
      wait
    else
      npm start
    fi
    exit $?
  fi
  sleep 1
done
echo "Models did not become ready within 30 minutes." >&2
exit 1
