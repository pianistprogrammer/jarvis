import fs from 'node:fs';
import { execSync } from 'node:child_process';

const RAW = 'data/raw/sample.jsonl';
const OUT = 'data/duplex-builder-test/train.jsonl';
const DEV = 'data/duplex-builder-test/dev.jsonl';

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
execSync(`node scripts/duplex/build-duplex-data.mjs --in ${RAW} --out ${OUT} --dev-out ${DEV}`, { stdio: 'inherit' });

// Basic checks
const trainLines = fs.readFileSync(OUT, 'utf-8').trim().split(/\n/);
if (trainLines.length === 0) throw new Error('No train data produced');
const rec = JSON.parse(trainLines[0]);
if (!rec.prompt || !rec.completion) throw new Error('Record missing prompt/completion fields');
if (!/^user: /.test(rec.prompt.split('\n').slice(-1)[0])) throw new Error('Last prompt line should be a user slice');
const validLines = fs.readFileSync('data/duplex-builder-test/valid.jsonl', 'utf-8').trim().split(/\n/);
if (validLines.length === 0) throw new Error('No validation data produced');
if (fs.existsSync('data/duplex-builder-test/test.jsonl')) throw new Error('Builder should not emit an empty MLX test split');
console.log('OK: duplex data builder');
