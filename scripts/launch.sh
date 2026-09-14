#!/usr/bin/env bash
set -euo pipefail

model_pid=""
cleanup() {
  [[ -n "$model_pid" ]] && kill "$model_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

if [[ ! -d dist ]]; then npm run build; fi
scripts/start-models.sh &
model_pid="$!"

echo "Waiting for local inference services…"
for _ in $(seq 1 1800); do
  if ! kill -0 "$model_pid" 2>/dev/null; then
    wait "$model_pid" || true
    echo "Model launcher stopped. Review logs/ before retrying." >&2
    exit 1
  fi
  if curl -fsS --max-time 2 http://127.0.0.1:8000/ >/dev/null 2>&1 && curl -fsS --max-time 2 http://127.0.0.1:8080/health >/dev/null 2>&1; then
    echo "Opening Aura at http://127.0.0.1:4100"
    npm start
    exit $?
  fi
  sleep 1
done
echo "Models did not become ready within 30 minutes." >&2
exit 1
