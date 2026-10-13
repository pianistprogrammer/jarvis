#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv.includes('--smoke') ? '/Volumes/AI/Datasets/jarvis-duplex/evaluations' : '/Volumes/AI/Datasets/jarvis-duplex/evaluations';
const adapterPath = '/Volumes/AI/Datasets/jarvis-duplex/adapters-qwen35-9b';
const datasetPath = '/Volumes/AI/Datasets/jarvis-duplex/test.jsonl';
const outFile = process.argv.includes('--smoke') ? path.join(outDir, 'smoke-test.jsonl') : path.join(outDir, 'heldout-test.jsonl');
fs.mkdirSync(outDir, { recursive: true });
console.log('Evaluation harness created. Adapter:', adapterPath, '| Endpoint:', 'http://127.0.0.1:8091');
console.log('Smoke mode:', !!process.argv.includes('--smoke'), '| Output:', outFile);
console.log('Run `npm run duplex:evaluate:smoke` or `npm run duplex:evaluate` to execute.');
