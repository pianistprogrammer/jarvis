import assert from 'node:assert/strict'
import test from 'node:test'
import { AgentSession } from '../server/agent.js'
import { frameAudioChunk } from '../server/audio-stream.js'

test('first completion disables Qwen thinking', async () => {
  const originalFetch = globalThis.fetch
  let request: Record<string, any> | undefined
  globalThis.fetch = async (_input, init) => {
    request = JSON.parse(String(init?.body))
    return new Response('data: {"choices":[{"delta":{"content":"Ready."}}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
  }
  try {
    await new AgentSession(() => {}).prompt('Hello')
    assert.deepEqual(request?.chat_template_kwargs, { enable_thinking: false })
    assert.deepEqual(request?.stream_options, { include_usage: true })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('audio chunks are length-framed for incremental playback', () => {
  const frame = frameAudioChunk(new Uint8Array([1, 2, 3]))
  assert.equal(frame.readUInt32LE(0), 3)
  assert.deepEqual([...frame.subarray(4)], [1, 2, 3])
})
