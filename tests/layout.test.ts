import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import { chromium } from 'playwright'

test('browser fills the right column and composer stays under the orb', async () => {
  const app = express()
  app.use(express.static('dist'))
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.route('**/api/config', route => route.fulfill({ json: {} }))
    await page.route('**/browser-ui/', route => route.fulfill({ body: '<html>Browser</html>' }))
    await page.routeWebSocket('**/ws', socket => { socket.send(JSON.stringify({ type: 'browser_active' })) })
    await page.routeWebSocket('**/stt', () => {})
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}`)
    await page.locator('.browser-panel').waitFor()
    const panel = await page.locator('.browser-panel').boundingBox()
    const composer = await page.locator('.composer').boundingBox()
    assert.ok(panel && composer)
    assert.ok(composer.x + composer.width <= panel.x, 'composer must stay to the left of browser')
    assert.ok(panel.y + panel.height > 860, 'browser should extend to bottom page padding')
    assert.ok(panel.x + panel.width > 1400, 'browser should extend to right page padding')
  } finally { await browser.close(); server.close() }
})
