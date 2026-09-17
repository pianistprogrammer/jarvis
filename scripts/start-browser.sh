#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/load-env.sh
name="${BROWSER_CONTAINER:-jarvis-browser}"
profile="${BROWSER_PROFILE_DIR:-$PWD/data/browser-vnc}"
if docker inspect "$name" >/dev/null 2>&1; then
  docker start "$name" >/dev/null
else
  mkdir -p "$profile"
  docker run -d --name "$name" --restart unless-stopped --shm-size=2gb --security-opt seccomp=unconfined \
    -e PUID=1000 -e PGID=1000 -e TZ=Etc/UTC \
    -e CUSTOM_USER="${BROWSER_USER:-agent}" -e PASSWORD="${BROWSER_PASSWORD:?Set BROWSER_PASSWORD in .env}" \
    -e CUSTOM_PORT=3010 -e CUSTOM_HTTPS_PORT=3011 \
    -e CHROME_CLI="--remote-debugging-port=9222" -e RESTART_APP=true \
    -p 127.0.0.1:3010:3010 -p 127.0.0.1:3011:3011 -p 127.0.0.1:9223:9223 \
    -v "$profile:/config" -v "$PWD/scripts/cdp-proxy.py:/usr/local/bin/cdp-proxy.py:ro" \
    lscr.io/linuxserver/chromium:latest >/dev/null
fi
ready=false
while [[ "$(docker inspect -f '{{.State.Running}}' "$name")" == true ]]; do
  if ! docker exec "$name" pgrep -f '^/usr/bin/python3 /usr/local/bin/cdp-proxy.py$' >/dev/null; then
    docker exec -d "$name" /usr/bin/python3 /usr/local/bin/cdp-proxy.py
  fi
  if curl -fsS --max-time 2 http://127.0.0.1:9223/json/version >/dev/null 2>&1; then
    if [[ "$ready" == false ]]; then echo 'Embedded browser CDP is ready'; ready=true; fi
  else
    ready=false
  fi
  sleep 5
done
echo 'Browser container stopped; retained for restart.' >&2
exit 1
