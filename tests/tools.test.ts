import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { agentBrowser } from '../server/browser.js'
import { executeTool } from '../server/tools.js'

test('calculator and workspace file tools', async () => {
  assert.equal(await executeTool('calculator', { expression: '(12 / 3) + 7' }), '11')
  assert.match(String(await executeTool('write_file', { path: 'test/note.txt', content: 'hello Jarvis' })), /Wrote 12 bytes/)
  assert.equal(await executeTool('read_file', { path: 'test/note.txt' }), 'hello Jarvis')
  assert.match(String(await executeTool('list_files', { path: 'test' })), /note\.txt/)
  await assert.rejects(() => executeTool('read_file', { path: '../../private.txt' }), /escapes the agent workspace/)
})

test('persistent browser returns references and screenshots', async (context) => {
  const server = createServer((_req, res) => res.end('<title>Tool test</title><main><h1>Browser works</h1><button>Continue</button></main>'))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  context.after(async () => { await agentBrowser.close(); server.close() })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server did not bind')
  const snapshot = await agentBrowser.open(`http://127.0.0.1:${address.port}`)
  assert.match(snapshot, /Title: Tool test/)
  assert.match(snapshot, /\[e1\] button(?:\(submit\))?: Continue/)
  assert.ok((await agentBrowser.screenshot()).length > 1_000)
})
