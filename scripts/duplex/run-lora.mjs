#!/usr/bin/env node
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const cfgPath = process.argv.includes('--config')
  ? process.argv[process.argv.indexOf('--config') + 1]
  : 'scripts/duplex/lora-config.json';
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));

// Build CLI args for mlx_lm lora; be compatible with older CLI.
const baseArgs = [
  'lora',
  '--model', cfg.model,
  '--train', '--data', cfg.dataDir,
  '--iters', String(cfg.iters),
  '--batch-size', String(cfg.batchSize),
  '--learning-rate', String(cfg.learningRate),
  '--fine-tune-type', 'lora'
];
if (cfg.maskPrompt) baseArgs.push('--mask-prompt');
if (cfg.lastKLayers) baseArgs.push('--num-layers', String(cfg.lastKLayers));
if (cfg.adapterPath) baseArgs.push('--adapter-path', cfg.adapterPath);

console.log('> mlx_lm', baseArgs.join(' '));
const p = spawn('mlx_lm', baseArgs, { stdio: 'inherit' });
p.on('exit', (code) => process.exit(code ?? 1));
