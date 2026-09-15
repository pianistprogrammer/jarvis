import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright'
import { config } from './config.js'

type Ref = { locator: Locator; page: Page; url: string }

class AgentBrowser {
  private browser?: Browser
  private context?: BrowserContext
  private page?: Page
  private refs = new Map<string, Ref>()
  private nextRef = 1

  private async ensure() {
    if (!this.context || (this.browser && !this.browser.isConnected())) {
      if (process.env.NODE_ENV === 'test') {
        this.browser = await chromium.launch({ headless: true })
        this.context = await this.browser.newContext({ viewport: { width: 1440, height: 960 } })
      } else {
        const endpoint = new URL(config.browserCdpUrl)
        const response = await fetch(`${endpoint.origin}/json/version`, { signal: AbortSignal.timeout(5000) })
        if (!response.ok) throw new Error('Browser service is unavailable')
        const version = await response.json() as { webSocketDebuggerUrl?: string }
        if (!version.webSocketDebuggerUrl) throw new Error('Browser CDP did not provide a websocket endpoint')
        const websocket = version.webSocketDebuggerUrl.replace(/^ws:\/\/[^/]+/, `ws://${endpoint.host}`)
        this.browser = await chromium.connectOverCDP(websocket, { timeout: 10000 })
        this.context = this.browser.contexts()[0]
        if (!this.context) throw new Error('Browser sidecar has no context')
      }
      this.page = undefined
      this.refs.clear()
      this.context.on('page', page => { this.page = page; this.refs.clear() })
    }
    const pages = this.context.pages().filter(page => !page.isClosed())
    for (const page of pages) {
      if (await page.evaluate(() => document.visibilityState === 'visible').catch(() => false)) {
        if (this.page !== page) this.refs.clear()
        this.page = page
        break
      }
    }
    if (!this.page || this.page.isClosed()) this.page = pages.at(-1) || await this.context.newPage()
    return this.page
  }

  private allowed(raw: string) {
    const url = new URL(raw)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) pages are allowed')
    if (!config.browserAllowlist.length) return
    const host = url.hostname.toLowerCase()
    if (!config.browserAllowlist.some(rule => host === rule || (rule.startsWith('*.') && host.endsWith(rule.slice(1))))) throw new Error(`Domain ${host} is outside BROWSER_ALLOWLIST`)
  }

  async open(url: string) {
    this.allowed(url)
    const page = await this.ensure()
    if (new URL(page.url()).href !== new URL(url).href) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.bringToFront()
    return this.snapshot()
  }

  async snapshot() {
    const page = await this.ensure()
    this.refs.clear()
    const lines: string[] = []
    const texts: string[] = []
    for (const frame of page.frames()) {
      const items = await frame.locator('a,button,input,textarea,select,[role="button"],[role="combobox"],[contenteditable="true"]').evaluateAll((elements, start) => elements.filter(el => {
        const style = getComputedStyle(el)
        return el.getClientRects().length > 0 && style.visibility !== 'hidden' && style.display !== 'none' && !el.closest('[inert],[aria-hidden="true"]')
      }).slice(0, 160).map((el, i) => {
        const node = el as HTMLElement
        const input = el as HTMLInputElement
        const label = (node.getAttribute('aria-label') || input.labels?.[0]?.textContent || node.innerText || input.placeholder || input.value || node.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 180)
        const id = `e${start + i}`
        node.setAttribute('data-agent-ref', id)
        return { id, label, tag: node.tagName.toLowerCase(), type: input.type || '', disabled: Boolean(input.disabled) }
      }), this.nextRef)
      this.nextRef += items.length
      for (const item of items) {
        this.refs.set(item.id, { locator: frame.locator(`[data-agent-ref="${item.id}"]`), page, url: page.url() })
        lines.push(`[${item.id}] ${item.tag}${item.type ? `(${item.type})` : ''}${item.disabled ? ' disabled' : ''}: ${item.label || '(unlabelled)'}`)
      }
      texts.push((await frame.locator('body').innerText({ timeout: 3000 }).catch(() => '')).slice(0, 12000))
    }
    return `Title: ${await page.title()}\nURL: ${page.url()}\nTabs: ${this.context!.pages().map((tab, index) => `${index}: ${tab.url()}${tab === page ? ' (active)' : ''}`).join('\n')}\n\nInteractive elements (visible only; first 160 per frame):\n${lines.join('\n')}\n\nPage text (up to 16000 characters):\n${texts.join('\n').slice(0, 16000)}`
  }

  private async target(ref: string) {
    const page = await this.ensure()
    const target = this.refs.get(ref.replace(/^\[|\]$/g, ''))
    if (!target || target.page !== page || target.url !== page.url()) throw new Error('Stale element reference. Take a fresh browser_snapshot and use its references.')
    return target.locator
  }

  async click(ref: string) {
    try {
      await (await this.target(ref)).click({ timeout: 5000 })
      await this.page!.waitForLoadState('domcontentloaded', { timeout: 5000 })
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : error}\nFresh page state (do not repeat the old reference):\n${await this.snapshot()}`)
    }
    return this.snapshot()
  }

  async type(ref: string, text: string, submit = false) {
    try {
      const locator = await this.target(ref)
      await locator.fill(text, { timeout: 5000 })
      if (submit) await locator.press('Enter', { timeout: 5000 })
      await this.page!.waitForLoadState('domcontentloaded', { timeout: 5000 })
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : error}\nFresh page state:\n${await this.snapshot()}`)
    }
    return this.snapshot()
  }

  async screenshot() { return (await this.ensure()).screenshot({ type: 'jpeg', quality: 72 }) }
  status() { return { active: Boolean(this.page && !this.page.isClosed() && this.browser?.isConnected()), url: this.page?.url() || '', tabs: this.context?.pages().length || 0 } }
  async input(action: 'click' | 'wheel' | 'key', data: { x?: number; y?: number; deltaX?: number; deltaY?: number; key?: string }) {
    const page = await this.ensure()
    if (action === 'click') await page.mouse.click(Number(data.x), Number(data.y))
    else if (action === 'wheel') await page.mouse.wheel(Number(data.deltaX || 0), Number(data.deltaY || 0))
    else if (action === 'key') await page.keyboard.press(String(data.key || ''))
    else throw new Error('Unknown browser input action')
    await page.waitForTimeout(200)
    return this.snapshot()
  }
  async switchTab(index: number) {
    await this.ensure()
    const page = this.context!.pages()[index]
    if (!page) throw new Error('Unknown tab index; take a fresh snapshot')
    await page.bringToFront(); this.page = page; this.refs.clear()
    return this.snapshot()
  }
  async newTab(url = 'about:blank') {
    if (url !== 'about:blank') this.allowed(url)
    await this.ensure()
    this.page = await this.context!.newPage()
    await this.page.bringToFront()
    if (url !== 'about:blank') await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    return this.snapshot()
  }
  async closeTab() {
    const page = await this.ensure()
    if (this.context!.pages().length > 1) { await page.close(); this.page = undefined }
    else await page.goto('about:blank')
    this.refs.clear()
    return this.snapshot()
  }
  async close() { await this.browser?.close(); this.browser = undefined; this.context = undefined; this.page = undefined; this.refs.clear() }
}

export const agentBrowser = new AgentBrowser()
