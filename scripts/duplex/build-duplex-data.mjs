#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    in: null,
    out: null,
    devOut: null,
    sliceMs: 600,
    minUserTok: 1,
    maxUserTok: 7,
    maxPhraseWords: 6,
    devSplit: 0.05,
    seed: 42,
  };

  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = args[index + 1];
    if (key === '--in') options.in = value;
    if (key === '--out') options.out = value;
    if (key === '--dev-out') options.devOut = value;
    if (key === '--slice-ms') options.sliceMs = Number.parseInt(value, 10);
    if (key === '--min-user-tok') options.minUserTok = Number.parseInt(value, 10);
    if (key === '--max-user-tok') options.maxUserTok = Number.parseInt(value, 10);
    if (key === '--max-phrase-words') options.maxPhraseWords = Number.parseInt(value, 10);
    if (key === '--dev-split') options.devSplit = Number.parseFloat(value);
    if (key === '--seed') options.seed = Number.parseInt(value, 10);
  }

  if (!options.in || !options.out || !options.devOut) {
    throw new Error('Usage: build-duplex-data.mjs --in raw.jsonl --out train.jsonl --dev-out dev.jsonl');
  }

  return options;
}

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
}

function words(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}

function splitMicroTurns(text, minWords, maxWords, random) {
  const tokens = words(text);
  const slices = [];
  let index = 0;

  while (index < tokens.length) {
    const span = Math.max(minWords, Math.min(maxWords, 1 + Math.floor(random() * maxWords)));
    slices.push(tokens.slice(index, index + span).join(' '));
    index += span;
  }

  return slices;
}

function toShortPhrase(text, maxWords) {
  return words(text).slice(0, maxWords).join(' ');
}

function toRecord(prompt, completion) {
  return { prompt, completion };
}

async function main() {
  const options = parseArgs();
  const random = makeRandom(options.seed);
  const records = [];
  const input = createInterface({ input: fs.createReadStream(options.in) });

  for await (const line of input) {
    if (!line.trim()) continue;

    let dialogue;
    try {
      dialogue = JSON.parse(line);
    } catch {
      continue;
    }

    let history = [];
    for (const message of dialogue.messages ?? []) {
      const content = String(message.content ?? '').trim();
      if (!content) continue;

      if (message.role === 'user') {
        for (const slice of splitMicroTurns(content, options.minUserTok, options.maxUserTok, random)) {
          const prompt = [...history, `user: ${slice}`].join('\n');
          records.push(toRecord(prompt, '<listen>'));
          history.push('assistant: <listen>');
          history = history.slice(-40);
        }
      }

      if (message.role === 'assistant') {
        const prompt = [...history, 'user: [NO_VOICE]'].join('\n');
        const completion = toShortPhrase(content, options.maxPhraseWords) || '<listen>';
        records.push(toRecord(prompt, completion));
        history.push(`assistant: ${completion}`);
        history = history.slice(-40);
      }
    }
  }

  if (records.length < 2) {
    throw new Error('Need at least two generated records to create train and validation data.');
  }

  const train = [];
  const valid = [];
  for (const record of records) {
    (random() < options.devSplit ? valid : train).push(record);
  }

  // MLX LM requires a non-empty validation file if it exists. Guarantee one for small datasets.
  if (valid.length === 0) valid.push(train.pop());
  if (train.length === 0) train.push(valid.pop());

  const writeJsonl = (file, rows) => fs.writeFileSync(file, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
  const dataDir = path.dirname(options.out);
  const validPath = path.join(dataDir, 'valid.jsonl');
  const testPath = path.join(dataDir, 'test.jsonl');

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.dirname(options.devOut), { recursive: true });
  writeJsonl(options.out, train);
  writeJsonl(options.devOut, valid);
  writeJsonl(validPath, valid);
  fs.rmSync(testPath, { force: true });

  console.log(`Wrote ${train.length} train and ${valid.length} validation micro-turns (${options.sliceMs}ms target window).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
