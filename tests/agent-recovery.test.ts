import assert from 'node:assert/strict'
import test from 'node:test'
import { AgentSession } from '../server/agent.js'

test('repeated tool failures end with a final explanation rather than exhausting rounds', async () => {
  const original = globalThis.fetch
  const events: any[] = []
  let requests = 0
  globalThis.fetch = async (_url, init) => {
    requests++
    const body = JSON.parse(String(init?.body))
    const delta = body.tool_choice === 'none' ? { content: 'The browser is unavailable; please try again after it reconnects.' } : { tool_calls: [{ index: 0, id: `call${requests}`, function: { name: 'missing_tool', arguments: '{}' } }] }
    return new Response(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\ndata: [DONE]\n\n`)
  }
  try {
    await new AgentSession(event => events.push(event)).prompt('Search for Apple news')
    assert.ok(requests <= 4)
    assert.ok(events.some(event => event.type === 'assistant_done'))
    assert.ok(!events.some(event => event.type === 'error'))
  } finally { globalThis.fetch = original }
})

test('browser tool loop emits at most one canned spoken cue per user turn', async () => {
  const original = globalThis.fetch
  const events: any[] = []
  let requests = 0
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body))
    const delta = body.tool_choice === 'none' ? { content: 'That action is unavailable.' } : {
      tool_calls: [{ index: 0, id: `call${++requests}`, function: { name: 'browser_missing_test_tool', arguments: '{}' } }],
    }
    return new Response(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\ndata: [DONE]\n\n`)
  }
  try {
    await new AgentSession(event => events.push(event)).prompt('Check the browser')
    assert.equal(events.filter(event => event.type === 'browser_active').length, 3)
    assert.equal(events.filter(event => event.type === 'notice').length, 1)
  } finally { globalThis.fetch = original }
})
