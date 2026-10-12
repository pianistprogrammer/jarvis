import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import { chromium } from 'playwright'
import { frameAudioChunk } from '../server/audio-stream.js'

test('browser opening does not prevent all audio packets being scheduled ahead', async () => {
  const app = express()
  app.use(express.static('dist'))
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.addInitScript(() => {
      const state = window as any
      state.speechStarts = []
      state.AudioContext = class {
        state = 'running'
        currentTime = 10
        destination = {}
        async decodeAudioData() { return { duration: 0.32 } }
        createBufferSource() {
          return { connect() {}, disconnect() {}, stop() {}, start(time: number) { state.speechStarts.push(time) } }
        }
      }
    })
    await page.route('**/api/config', route => route.fulfill({ json: {} }))
    await page.route('**/browser-ui/', route => route.fulfill({ body: '<html>Browser</html>' }))
    await page.route('**/api/tts', route => route.fulfill({
      contentType: 'application/x-jarvis-audio-stream',
      body: Buffer.concat([1, 2, 3].map(n => frameAudioChunk(new Uint8Array([n])))),
    }))
    await page.routeWebSocket('**/ws', socket => {
      socket.send(JSON.stringify({ type: 'browser_active' }))
      socket.send(JSON.stringify({ type: 'notice', text: 'Let me take a look at that page.' }))
    })
    await page.routeWebSocket('**/stt', () => {})
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}`)
    await page.waitForFunction(() => (window as any).speechStarts.length === 3)
    const starts = await page.evaluate(() => (window as any).speechStarts as number[])
    assert.ok(await page.locator('.browser-panel').isVisible())
    assert.ok(Math.abs(starts[1] - starts[0] - 0.32) < 1e-8)
    assert.ok(Math.abs(starts[2] - starts[1] - 0.32) < 1e-8)
  } finally { await browser.close(); server.close() }
})
