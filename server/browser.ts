import { chromium, type BrowserContext, type Page } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { config } from './config.js'

type Ref = { selector: string; label: string }

class AgentBrowser {
  private context?: BrowserContext
  private page?: Page
  private refs = new Map<string, Ref>()

  private async ensure() {
    if (this.page && !this.page.isClosed()) return this.page
    await mkdir(config.browserProfile, { recursive: true })
    this.context = await chromium.launchPersistentContext(config.browserProfile, {
      headless: config.browserHeadless,
      viewport: { width: 1440, height: 960 },
      args: ['--disable-blink-features=AutomationControlled'],
    })
    this.page = this.context.pages()[0] || await this.context.newPage()
    return this.page
  }

  private allowed(raw: string) {
    const url = new URL(raw)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) pages are allowed')
    if (!config.browserAllowlist.length) return
    const host = url.hostname.toLowerCase()
    if (!config.browserAllowlist.some((rule) => host === rule || (rule.startsWith('*.') && host.endsWith(rule.slice(1))))) {
      throw new Error(`Domain ${host} is outside BROWSER_ALLOWLIST`)
    }
  }

  async open(url: string) {
    this.allowed(url)
    const page = await this.ensure()
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    return this.snapshot()
  }

  async snapshot() {
    const page = await this.ensure()
    const title = await page.title()
    const url = page.url()
    const items = await page.locator('a,button,input,textarea,select,[role="button"],[contenteditable="true"]').evaluateAll((els) => els.slice(0, 80).map((el, i) => {
      const node = el as HTMLElement
      const input = el as HTMLInputElement
      const label = (node.innerText || input.value || input.placeholder || node.getAttribute('aria-label') || node.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 140)
      const tag = node.tagName.toLowerCase()
      const id = `agent-ref-${i}`
      node.setAttribute('data-agent-ref', id)
      return { id, tag, label, type: input.type || '', disabled: Boolean(input.disabled) }
    }))
    this.refs.clear()
    const lines = items.map((item, i) => {
      const ref = `e${i + 1}`
      this.refs.set(ref, { selector: `[data-agent-ref="${item.id}"]`, label: item.label })
      return `[${ref}] ${item.tag}${item.type ? `(${item.type})` : ''}${item.disabled ? ' disabled' : ''}: ${item.label || '(unlabelled)'}`
    })
    const text = (await page.locator('body').innerText({ timeout: 5_000 }).catch(() => '')).replace(/\n{3,}/g, '\n\n').slice(0, 12_000)
    return `Title: ${title}\nURL: ${url}\n\nInteractive elements:\n${lines.join('\n')}\n\nPage text:\n${text}`
  }

  async click(ref: string) {
    const page = await this.ensure()
    const target = this.refs.get(ref)
    if (!target) throw new Error(`Unknown reference ${ref}; take a fresh snapshot`)
    await page.locator(target.selector).click({ timeout: 10_000 })
    await page.waitForTimeout(350)
    return this.snapshot()
  }

  async type(ref: string, text: string, submit = false) {
    const page = await this.ensure()
    const target = this.refs.get(ref)
    if (!target) throw new Error(`Unknown reference ${ref}; take a fresh snapshot`)
    const locator = page.locator(target.selector)
    await locator.fill(text)
    if (submit) await locator.press('Enter')
    await page.waitForTimeout(250)
    return this.snapshot()
  }

  async screenshot() {
    const page = await this.ensure()
    return page.screenshot({ type: 'jpeg', quality: 72 })
  }

  status() { return { active: Boolean(this.page && !this.page.isClosed()), url: this.page?.url() || '', headless: config.browserHeadless } }
  async close() { await this.context?.close(); this.context = undefined; this.page = undefined; this.refs.clear() }
}

export const agentBrowser = new AgentBrowser()
