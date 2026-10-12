import fs from 'node:fs';
import { execSync } from 'node:child_process';

const RAW = 'data/raw/sample.jsonl';
const OUT = 'data/duplex/train.jsonl';
const DEV = 'data/duplex/dev.jsonl';

// Prepare sample raw
fs.mkdirSync('data/raw', { recursive: true });
fs.writeFileSync(RAW, [
  JSON.stringify({ messages: [
    { role: 'user', content: 'my coffee grinder keeps' },
    { role: 'assistant', content: 'That usually means oils from darker roasts are building up.' },
    { role: 'user', content: 'jamming on fine beans' },
    { role: 'assistant', content: 'Try a coarser grind and clean the burrs.' },
  ]})
].join('\n'));

// Run builder
execSync('node scripts/duplex/build-duplex-data.mjs --in data/raw/sample.jsonl --out data/duplex/train.jsonl --dev-out data/duplex/dev.jsonl', { stdio: 'inherit' });

// Basic checks
const trainLines = fs.readFileSync(OUT, 'utf-8').trim().split(/\n/);
if (trainLines.length === 0) throw new Error('No train data produced');
const rec = JSON.parse(trainLines[0]);
if (!rec.input || !rec.output) throw new Error('Record missing fields');
if (!/^user: /.test(rec.input.split('\n').slice(-1)[0])) throw new Error('Last input line should be user: slice');
console.log('OK: duplex data builder');
