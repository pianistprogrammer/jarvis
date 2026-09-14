#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "This setup targets Apple silicon macOS (arm64)." >&2
  exit 1
fi

for command in brew node npm; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing $command. Install Homebrew and Node.js 20+ first." >&2
    exit 1
  fi
done

brew list llama.cpp >/dev/null 2>&1 || brew install llama.cpp
brew list uv >/dev/null 2>&1 || brew install uv
brew list ffmpeg >/dev/null 2>&1 || brew install ffmpeg
brew list espeak-ng >/dev/null 2>&1 || brew install espeak-ng

npm ci
npx playwright install chromium
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python "mlx-audio[all]==0.5.4" "misaki[en]"

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

mkdir -p workspace data/browser-profile logs
npm run build
echo
echo "Setup complete. Run: npm run launch"
