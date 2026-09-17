import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

test('launcher loads dotenv text literally, including shell syntax, and respects exported overrides', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jarvis-env-test-'))
  try {
    await symlink(path.resolve('node_modules'), path.join(directory, 'node_modules'))
    const instruction = "Speak as a steady assistant. Don't execute $(exit 93) or `exit 94`; keep $PATH literal."
    await writeFile(path.join(directory, '.env'), `JARVIS_TEST_INSTRUCT=${instruction}\nJARVIS_TEST_OVERRIDE=from-file\n`)
    const result = spawnSync('bash', ['-c', 'set -euo pipefail; source "$1"; node -e \'console.log(JSON.stringify([process.env.JARVIS_TEST_INSTRUCT, process.env.JARVIS_TEST_OVERRIDE]))\'', 'test', path.resolve('scripts/load-env.sh')], {
      cwd: directory,
      env: { ...process.env, JARVIS_TEST_OVERRIDE: 'exported' },
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), [instruction, 'exported'])
    assert.equal(result.stderr, '')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
