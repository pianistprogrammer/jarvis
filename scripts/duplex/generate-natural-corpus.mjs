#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function optionsFromArgs() {
  const values = { outDir: 'data/duplex-natural', trainSize: 1000, validSize: 150, testSize: 150, seed: 42 };
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = args[index + 1];
    if (key === '--out-dir') values.outDir = value;
    if (key === '--train-size') values.trainSize = Number.parseInt(value, 10);
    if (key === '--valid-size') values.validSize = Number.parseInt(value, 10);
    if (key === '--test-size') values.testSize = Number.parseInt(value, 10);
    if (key === '--seed') values.seed = Number.parseInt(value, 10);
  }
  return values;
}

function randomFromSeed(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
}

function pick(items, random) {
  return items[Math.floor(random() * items.length)];
}

const scenarios = [
  ['coffee grinder', 'it keeps catching on fine beans', 'clean the burrs then go coarser'],
  ['calendar', 'two meetings overlap tomorrow morning', 'move the less urgent one'],
  ['presentation', 'the opening sounds a little flat', 'lead with their problem'],
  ['wifi', 'the connection drops after heavy rain', 'check the outside cable'],
  ['recipe', 'I only have half the ingredients', 'tell me what remains'],
  ['flight', 'the layover suddenly got very short', 'want me to compare options'],
  ['budget', 'I spent too much this week', 'sort it by category'],
  ['email', 'I need to decline politely', 'keep it short and warm'],
  ['printer', 'every page comes out faded', 'check the toner first'],
  ['meeting', 'I need to raise something carefully', 'say what you noticed'],
  ['bike chain', 'it slips under hard pedaling', 'check the chain wear'],
  ['laundry machine', 'it smells musty after cycles', 'run a hot clean'],
  ['phone battery', 'it drains before lunchtime', 'check battery health first'],
  ['rent increase', 'my landlord raised it again', 'read the notice closely'],
  ['job interview', 'I keep rushing my answers', 'pause before answering'],
  ['sore shoulder', 'it hurts after moving boxes', 'rest it and get checked'],
  ['travel plan', 'the museum is closed Monday', 'swap the days around'],
  ['slow laptop', 'it freezes during video calls', 'close background apps first'],
  ['garden plants', 'the leaves are turning yellow', 'check the soil drainage'],
  ['kitchen faucet', 'it drips all night', 'replace the worn washer'],
];

const openers = ['so, um', 'okay, so', 'hey, quick thing', 'I was wondering', 'right, so', 'this is probably silly but'];
const acknowledgments = ['yeah', 'mm-hm', 'right', 'okay'];
const fillers = ['um', 'uh', 'you know', 'kind of'];

function chunks(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const result = [];
  for (let index = 0; index < words.length; index += 3) result.push(words.slice(index, index + 3).join(' '));
  return result;
}

function makeCall(callId, split, random) {
  const [topic, problem, answer] = pick(scenarios, random);
  const history = [];
  const ticks = [];
  const add = (heard, said, tag, weight) => {
    const prompt = [...history, `user: ${heard}`].join('\n');
    ticks.push({ prompt, completion: said, tag, weight, callId, heard, said });
    history.push(`user: ${heard}`, `assistant: ${said}`);
    if (history.length > 80) history.splice(0, history.length - 80);
  };

  add('<no voice>', '<listen>', 'listen_idle', 0.2);
  add(`${pick(openers, random)} I have this`, '<listen>', 'listen_speech', 0.3);
  add(`${topic} issue and`, '<listen>', 'listen_speech', 0.3);
  add(`${pick(fillers, random)}, ${problem.split(' ').slice(0, 4).join(' ')}`, '<listen>', 'listen_speech', 0.3);
  add('<no voice>', '<listen>', 'listen_pause', 2.0);
  add(problem.split(' ').slice(4).join(' ') || 'what should I do', '<backchannel>', 'continuer', 1.5);
  add('what would you try?', '<listen>', 'listen_speech', 0.3);

  const answerChunks = chunks(answer);
  add('<no voice>', answerChunks.shift() ?? 'let me think', 'start', 6.0);
  for (const phrase of answerChunks) {
    add('<no voice>', phrase, 'speak', 2.0);
  }

  add(pick(acknowledgments, random), 'that should help', 'keep_talking', 2.0);
  add('<no voice>', '<listen>', 'listen_done', 1.5);

  if (callId % 3 === 0) {
    add('wait, hold on', '<listen>', 'barge_stop', 3.0);
    add('one more detail', '<listen>', 'barge_listen', 1.0);
    add('it started yesterday', '<listen>', 'barge_listen', 1.0);
  }

  if (callId % 5 === 0) {
    add('I was thinking of mixing bleach', "don't mix cleaners", 'hazard_start', 4.0);
    add('with another cleaner', 'it makes gas', 'hazard', 1.5);
    add('<no voice>', 'step away now', 'hazard', 1.5);
  }

  return { split, dialogues: [callId], ticks };
}

function buildSplit(split, size, firstCallId, random) {
  const rows = [];
  const calls = [];
  let callId = firstCallId;
  while (rows.length < size) {
    const call = makeCall(callId, split, random);
    calls.push(call);
    for (const tick of call.ticks) {
      if (rows.length === size) break;
      rows.push({ prompt: tick.prompt, completion: tick.completion, tag: tick.tag, weight: tick.weight, callId: tick.callId });
    }
    callId += 1;
  }
  return { rows, calls, nextCallId: callId };
}

function writeJsonl(file, rows) {
  fs.writeFileSync(file, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
}

function main() {
  const options = optionsFromArgs();
  const random = randomFromSeed(options.seed);
  fs.mkdirSync(options.outDir, { recursive: true });

  const train = buildSplit('train', options.trainSize, 0, random);
  const valid = buildSplit('valid', options.validSize, train.nextCallId, random);
  const test = buildSplit('test', options.testSize, valid.nextCallId, random);

  writeJsonl(path.join(options.outDir, 'train.jsonl'), train.rows);
  writeJsonl(path.join(options.outDir, 'valid.jsonl'), valid.rows);
  writeJsonl(path.join(options.outDir, 'test.jsonl'), test.rows);
  writeJsonl(path.join(options.outDir, 'calls_train.jsonl'), train.calls);
  writeJsonl(path.join(options.outDir, 'calls_valid.jsonl'), valid.calls);
  writeJsonl(path.join(options.outDir, 'calls_test.jsonl'), test.calls);
  console.log(`Wrote ${train.rows.length} train, ${valid.rows.length} valid, and ${test.rows.length} test streaming ticks.`);
}

main();
