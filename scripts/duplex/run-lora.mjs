#!/usr/bin/env node
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const cfgPath = process.argv.includes('--config')
  ? process.argv[process.argv.indexOf('--config') + 1]
  : 'scripts/duplex/lora-config.json';
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));

// Build CLI args for mlx_lm.lora; not all flags exist in every version.
const baseArgs = [
  'lora',
  '--model', cfg.model,
  '--train', '--data', cfg.dataDir,
  '--iters', String(cfg.iters),
  '--batch-size', String(cfg.batchSize),
  '--learning-rate', String(cfg.learningRate),
];
if (cfg.maskPrompt) baseArgs.push('--mask-prompt');
if (cfg.loraR) baseArgs.push('--lora-r', String(cfg.loraR));
if (cfg.loraAlpha) baseArgs.push('--lora-alpha', String(cfg.loraAlpha));
if (cfg.targetModules?.length) baseArgs.push('--lora-target-modules', cfg.targetModules.join(','));
if (cfg.lastKLayers) baseArgs.push('--lora-last-k-layers', String(cfg.lastKLayers));

console.log('> mlx_lm', baseArgs.join(' '));
const p = spawn('mlx_lm', baseArgs, { stdio: 'inherit' });
p.on('exit', (code) => process.exit(code ?? 1));
