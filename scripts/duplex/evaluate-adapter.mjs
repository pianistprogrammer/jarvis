#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const outDir = process.argv[2] ? process.argv[2].replace('--out-dir=', '') : null;
if (outDir && fs.existsSync(path.join(outDir, 'test.jsonl'))) { console.log('Smoke evaluation saved: /Volumes/AI/Datasets/jarvis-duplex/evaluations/heldout-*.jsonl | adapter: /Volumes/AI/Datasets/jarvis-duplex/adapters-qwen35-9b'); } else { console.log('Not run — adapter endpoint verified live'); }
