import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { agentBrowser } from '../server/browser.js'

test('browser exposes visible controls, rejects stale refs, submits and reads frames', async () => {
  const server = createServer((req, res) => res.end(req.url?.startsWith('/search') ? '<title>Results</title>Apple news found' : `<title>Search</title>${'<button hidden>Hidden</button>'.repeat(90)}<form action="/search"><input aria-label="Search query" name="q"><button>Search</button></form><iframe srcdoc="<button>Frame action</button>"></iframe>`))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address() as { port: number }
    let snapshot = await agentBrowser.open(`http://127.0.0.1:${address.port}`)
    assert.doesNotMatch(snapshot, /Hidden/)
    assert.match(snapshot, /Frame action/)
    const ref = snapshot.match(/\[(e\d+)\] input.*Search query/)?.[1]
    assert.ok(ref)
    snapshot = await agentBrowser.snapshot()
    await assert.rejects(agentBrowser.click(ref), /stale|fresh/i)
    snapshot = await agentBrowser.snapshot()
    const fresh = snapshot.match(/\[(e\d+)\] input.*Search query/)?.[1]
    assert.ok(fresh)
    const result = await agentBrowser.type(fresh, 'Apple news', true)
    assert.match(result, /Apple news found/)
    assert.match(result, /Title: Results/)
  } finally { await agentBrowser.close(); server.close() }
})
