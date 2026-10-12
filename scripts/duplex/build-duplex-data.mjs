#!/usr/bin/env node
import fs from 'node:fs';
import readline from 'node:readline';
import { createInterface } from 'node:readline';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    in: null,
    out: null,
    devOut: null,
    sliceMs: 600,
    minUserTok: 1,
    maxUserTok: 7,
    listenRatio: 0.7,
    maxPhraseWords: 6,
    devSplit: 0.05,
    seed: 42,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const v = args[i + 1];
    if (a === '--in') out.in = v;
    if (a === '--out') out.out = v;
    if (a === '--dev-out') out.devOut = v;
    if (a === '--slice-ms') out.sliceMs = parseInt(v, 10);
    if (a === '--min-user-tok') out.minUserTok = parseInt(v, 10);
    if (a === '--max-user-tok') out.maxUserTok = parseInt(v, 10);
    if (a === '--listen-ratio') out.listenRatio = parseFloat(v);
    if (a === '--max-phrase-words') out.maxPhraseWords = parseInt(v, 10);
    if (a === '--dev-split') out.devSplit = parseFloat(v);
    if (a === '--seed') out.seed = parseInt(v, 10);
  }
  if (!out.in || !out.out || !out.devOut) {
    console.error('Usage: build-duplex-data.mjs --in raw.jsonl --out train.jsonl --dev-out dev.jsonl [--slice-ms 600 --listen-ratio 0.7]');
    process.exit(1);
  }
  return out;
}

function rand(seed) {
  // xorshift32
  let x = seed >>> 0;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    return x / 0xFFFFFFFF;
  };
}

function splitIntoTokens(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}

function chunkUserUtterance(text, minTok, maxTok, rng) {
  const toks = splitIntoTokens(text);
  const chunks = [];
  let i = 0;
  while (i < toks.length) {
    const span = Math.max(minTok, Math.min(maxTok, 1 + Math.floor(rng() * maxTok)));
    const end = Math.min(toks.length, i + span);
    chunks.push(toks.slice(i, end).join(' '));
    i = end;
  }
  return chunks;
}

function maybeShortPhrase(text, maxWords) {
  const toks = splitIntoTokens(text);
  if (toks.length <= maxWords) return text;
  return toks.slice(0, maxWords).join(' ');
}

async function main() {
  const cfg = parseArgs();
  const rng = rand(cfg.seed);
  const path = await import('node:path');
  fs.mkdirSync(path.dirname(cfg.out), { recursive: true });
  fs.mkdirSync(path.dirname(cfg.devOut), { recursive: true });
  const train = fs.createWriteStream(cfg.out);
  const dev = fs.createWriteStream(cfg.devOut);

  const rl = createInterface({ input: fs.createReadStream(cfg.in) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    const messages = rec.messages || [];
    // Build alternating micro-turns from user/assistant long turns
    let history = [];
    for (let idx = 0; idx < messages.length; idx++) {
      const m = messages[idx];
      const role = m.role;
      const text = (m.content || '').trim();
      if (!text) continue;
      if (role === 'user') {
        // Split user into micro-turns; for each, target is LISTEN most of the time
        const chunks = chunkUserUtterance(text, cfg.minUserTok, cfg.maxUserTok, rng);
        for (let c = 0; c < chunks.length; c++) {
          const userSlice = chunks[c];
          const input = history.join('\n') + (history.length ? '\n' : '') + `user: ${userSlice}`;
          const output = 'LISTEN';
          const row = { input, output };
          (rng() < cfg.devSplit ? dev : train).write(JSON.stringify(row) + '\n');
          history.push(`assistant: ${output}`);
          if (history.length > 40) history = history.slice(-40);
        }
      } else if (role === 'assistant') {
        // Compress assistant response into one or two short micro-turns
        const phrase = maybeShortPhrase(text, cfg.maxPhraseWords);
        const input = history.join('\n') + (history.length ? '\n' : '') + 'user: [NO_VOICE]';
        const output = phrase || 'LISTEN';
        const row = { input, output };
        (rng() < cfg.devSplit ? dev : train).write(JSON.stringify(row) + '\n');
        history.push(`assistant: ${output}`);
        if (history.length > 40) history = history.slice(-40);
      }
    }
  }
  train.end();
  dev.end();
}

main().catch(err => { console.error(err); process.exit(1); });
