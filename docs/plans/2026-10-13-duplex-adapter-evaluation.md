# Duplex Adapter Evaluation Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Measure the completed Qwen duplex LoRA on held-out streaming ticks and save inspectable predictions.

**Architecture:** A Node evaluator will stratify samples from `/Volumes/AI/Datasets/jarvis-duplex/test.jsonl` by tick tag, invoke `mlx_lm generate` with the saved adapter for each prompt, normalize the generated reply, and write JSONL predictions plus aggregate metrics. A small deterministic smoke mode verifies adapter loading and output capture; full mode covers all held-out rows.

**Tech Stack:** Node.js ESM, `node:child_process`, MLX LM CLI, JSONL corpus on `/Volumes/AI`.

---

### Task 1: Define evaluator behavior with a failing test

**Files:**
- Create: `tests/duplex-eval.test.mjs`
- Create: `scripts/duplex/evaluate-adapter.mjs`

**Step 1: Write the failing test**

Test a pure exported helper that:
- groups candidates by `tag`;
- selects a balanced, deterministic sample;
- normalizes `<listen>` and short generated phrases;
- calculates control accuracy and exact-match accuracy.

**Step 2: Run the test to verify it fails**

Run:

```bash
node tests/duplex-eval.test.mjs
```

Expected: failure because `evaluate-adapter.mjs` does not exist.

**Step 3: Implement the pure helpers**

Export `selectBalancedRows`, `normalizeCompletion`, and `summarizePredictions`. Do not run MLX in unit tests.

**Step 4: Run the test to verify it passes**

Run:

```bash
node tests/duplex-eval.test.mjs
```

Expected: `OK: duplex evaluation helpers`.

### Task 2: Add adapter invocation and saved predictions

**Files:**
- Modify: `scripts/duplex/evaluate-adapter.mjs`
- Modify: `package.json`

**Step 1: Extend the failing test**

Add a fixture-based test that validates an evaluator result JSONL record includes: `prompt`, `expected`, `actual`, `tag`, `weight`, and match flags.

**Step 2: Run the test to verify it fails**

Run:

```bash
node tests/duplex-eval.test.mjs
```

**Step 3: Implement CLI mode**

Add options for model, adapter path, dataset path, samples per tag, and output path. For each selected row, call `mlx_lm generate` with deterministic decoding and retain stdout/stderr on failure. Add `npm run duplex:evaluate` and a small `duplex:evaluate:smoke` command.

**Step 4: Run the test to verify it passes**

Run:

```bash
node tests/duplex-eval.test.mjs
```

### Task 3: Run and inspect a real adapter smoke evaluation

**Files:**
- Output: `/Volumes/AI/Datasets/jarvis-duplex/evaluations/smoke-*.jsonl`
- Output: `/Volumes/AI/Datasets/jarvis-duplex/evaluations/smoke-*.summary.json`

**Step 1: Run smoke evaluation**

```bash
npm run duplex:evaluate:smoke
```

**Step 2: Verify output**

Confirm the adapter loads, every selected row receives a captured completion, and both predictions and summary files exist. Report metrics by tag; do not equate high synthetic exact-match with real-world turn-taking quality.

### Task 4: Run the complete held-out benchmark

**Files:**
- Output: `/Volumes/AI/Datasets/jarvis-duplex/evaluations/heldout-*.jsonl`
- Output: `/Volumes/AI/Datasets/jarvis-duplex/evaluations/heldout-*.summary.json`

**Step 1: Run full evaluation**

```bash
npm run duplex:evaluate
```

**Step 2: Verify benchmark report**

Check the split, sample count, per-tag accuracy, `<listen>` precision/recall, exact-match rate, and a manual-review subset containing pause, continuer, interruption, and hazard cases.

### Task 5: Commit evaluation harness

**Files:**
- Modify: `package.json`
- Create: `scripts/duplex/evaluate-adapter.mjs`
- Create: `tests/duplex-eval.test.mjs`
- Create: `docs/plans/2026-10-13-duplex-adapter-evaluation.md`

**Step 1: Run verification**

```bash
npm run test:duplex
node tests/duplex-eval.test.mjs
```

**Step 2: Commit and push**

```bash
git add package.json scripts/duplex/evaluate-adapter.mjs tests/duplex-eval.test.mjs docs/plans/2026-10-13-duplex-adapter-evaluation.md
git commit -m "Add duplex adapter evaluation harness"
git push origin feat/duplex-lora-mlx
```
