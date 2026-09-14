import { config } from './config.js'
import { executeTool, toolDefinitions } from './tools.js'

type Message = Record<string, unknown>
type Send = (event: Record<string, unknown>) => void
type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }

const system = `You are Jarvis, a private voice-first assistant running locally on the user's Mac. Be useful, calm, and concise. You can operate a persistent browser and files inside a dedicated workspace. Before a tool call, give one very short spoken-friendly sentence explaining what you are about to do. Never claim a tool succeeded until you saw its result. Browser element references only remain valid until the next snapshot. Avoid Markdown tables and long lists in spoken responses.`

export class AgentSession {
  private history: Message[] = [{ role: 'system', content: system }]
  private controller?: AbortController
  constructor(private send: Send) {}

  cancel() { this.controller?.abort(); this.controller = undefined; this.send({ type: 'status', value: 'listening' }) }
  reset() { this.cancel(); this.history = [{ role: 'system', content: system }]; this.send({ type: 'reset' }) }

  async prompt(text: string) {
    this.cancel()
    this.controller = new AbortController()
    const signal = this.controller.signal
    this.history.push({ role: 'user', content: text })
    this.send({ type: 'user', text })
    try {
      for (let round = 0; round < 8; round++) {
        this.send({ type: 'status', value: round ? 'working' : 'thinking' })
        const result = await this.completion(signal)
        if (!result.toolCalls.length) {
          this.history.push({ role: 'assistant', content: result.text })
          this.send({ type: 'assistant_done', text: result.text })
          this.send({ type: 'status', value: 'listening' })
          return
        }
        this.history.push({ role: 'assistant', content: result.text || null, tool_calls: result.toolCalls })
        for (const call of result.toolCalls) {
          let args: Record<string, unknown> = {}
          try { args = JSON.parse(call.function.arguments || '{}') } catch { args = {} }
          this.send({ type: 'tool_start', id: call.id, name: call.function.name, detail: Object.values(args)[0] || '' })
          try {
            const output = await executeTool(call.function.name, args)
            this.history.push({ role: 'tool', tool_call_id: call.id, content: String(output) })
            this.send({ type: 'tool_end', id: call.id, name: call.function.name, ok: true })
            if (call.function.name.startsWith('browser_')) this.send({ type: 'browser_active' })
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            this.history.push({ role: 'tool', tool_call_id: call.id, content: `Error: ${message}` })
            this.send({ type: 'tool_end', id: call.id, name: call.function.name, ok: false, error: message })
          }
        }
      }
      throw new Error('The agent exceeded its tool-call round limit')
    } catch (error) {
      if (signal.aborted) return
      this.send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
      this.send({ type: 'status', value: 'error' })
    }
  }

  private async completion(signal: AbortSignal) {
    const response = await fetch(`${config.llmBaseUrl}/chat/completions`, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.llmApiKey}` },
      body: JSON.stringify({ model: config.llmModel, messages: this.history, tools: toolDefinitions, tool_choice: 'auto', stream: true, temperature: 0.6, max_tokens: 1200 }),
    })
    if (!response.ok || !response.body) throw new Error(`LLM returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = '', text = ''
    const calls = new Map<number, ToolCall>()
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n'); buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data:') || line.includes('[DONE]')) continue
        let payload: any
        try { payload = JSON.parse(line.slice(5).trim()) } catch { continue }
        const delta = payload.choices?.[0]?.delta
        if (typeof delta?.content === 'string') { text += delta.content; this.send({ type: 'assistant_delta', text: delta.content }) }
        for (const part of delta?.tool_calls || []) {
          const prior = calls.get(part.index) || { id: '', type: 'function' as const, function: { name: '', arguments: '' } }
          prior.id += part.id || ''; prior.function.name += part.function?.name || ''; prior.function.arguments += part.function?.arguments || ''; calls.set(part.index, prior)
        }
      }
    }
    return { text, toolCalls: [...calls.values()] }
  }
}
