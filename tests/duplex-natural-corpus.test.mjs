import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const outDir = 'data/duplex-natural-test';
fs.rmSync(outDir, { recursive: true, force: true });

execFileSync('node', [
  'scripts/duplex/generate-natural-corpus.mjs',
  '--out-dir', outDir,
  '--train-size', '200',
  '--valid-size', '30',
  '--test-size', '30',
  '--seed', '7',
], { stdio: 'inherit' });

function readRows(name) {
  return fs.readFileSync(`${outDir}/${name}.jsonl`, 'utf8').trim().split('\n').map(JSON.parse);
}

const train = readRows('train');
const valid = readRows('valid');
const test = readRows('test');

if (train.length !== 200 || valid.length !== 30 || test.length !== 30) {
  throw new Error('Corpus split sizes do not match the requested values');
}

for (const row of [...train, ...valid, ...test]) {
  if (!row.prompt || !row.completion) throw new Error('Rows need prompt and completion fields');
  if (!row.prompt.includes('user:')) throw new Error('Rows need a spoken user stream');
  if (!row.tag || typeof row.weight !== 'number') throw new Error('Rows need tick metadata');
  if (row.completion !== '<listen>' && row.completion.split(/\s+/).filter(Boolean).length > 3) {
    throw new Error('Spoken completions must stay within three words');
  }
}

if (new Set(train.map((row) => JSON.stringify(row))).size < 180) {
  throw new Error('Corpus needs diverse spoken-stream rows');
}

const tags = ['listen_speech', 'listen_idle', 'listen_pause', 'listen_done', 'continuer', 'start', 'speak', 'keep_talking', 'barge_stop', 'barge_listen'];
for (const tag of tags) {
  if (!train.some((row) => row.tag === tag)) throw new Error(`Corpus needs ${tag} examples`);
}
if (!train.some((row) => row.prompt.includes('<no voice>'))) throw new Error('Corpus needs pause examples');
if (!train.some((row) => /wait|hold on|stop/i.test(row.prompt))) throw new Error('Corpus needs interruption examples');

console.log('OK: natural duplex corpus');
