import assert from 'node:assert/strict'
import test from 'node:test'
import { compactHistory } from '../server/memory.js'

test('compaction retains latest atomic tool exchange and latest user goal', async () => {
  const history = [{ role: 'system', content: 'system' }, { role: 'user', content: 'Find Apple news' }, { role: 'assistant', content: 'old'.repeat(500) }, { role: 'assistant', tool_calls: [{ id: 'a' }] }, { role: 'tool', tool_call_id: 'a', content: 'Current page and references' }]
  const result = await compactHistory(history, async () => 'Goal: Apple news. Open tabs: Google. Findings: none.', 500)
  assert.equal(result[0], history[0])
  assert.deepEqual(result.slice(-2), history.slice(-2))
  assert.match(JSON.stringify(result), /Apple news/)
})

test('failed compaction does not mutate history', async () => {
  const history = [{ role: 'system', content: 'system' }, { role: 'user', content: 'goal' }, { role: 'assistant', content: 'long'.repeat(500) }, { role: 'user', content: 'continue' }]
  const original = JSON.stringify(history)
  await assert.rejects(compactHistory(history, async () => { throw new Error('offline') }, 500), /offline/)
  assert.equal(JSON.stringify(history), original)
})
