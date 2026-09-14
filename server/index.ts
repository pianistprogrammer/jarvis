import express from 'express'
import { createServer } from 'node:http'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { WebSocketServer, WebSocket } from 'ws'
import { config } from './config.js'
import { agentBrowser } from './browser.js'
import { AgentSession } from './agent.js'

await mkdir(config.workspace, { recursive: true })
const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) => res.json({ ok: true, profile: config.profile, model: config.llmModel, workspace: config.workspace }))
app.get('/api/config', (_req, res) => res.json({ profile: config.profile, llmModel: config.llmModel, sttModel: config.sttModel, ttsModel: config.ttsModel, ttsVoice: config.ttsVoice }))
app.get('/api/browser/status', (_req, res) => res.json(agentBrowser.status()))
app.get('/api/browser/screenshot', async (_req, res) => {
  try { res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' }).send(await agentBrowser.screenshot()) }
  catch { res.sendStatus(404) }
})
app.post('/api/transcribe', express.raw({ type: ['audio/wav', 'audio/webm', 'application/octet-stream'], limit: '16mb' }), async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Audio is required' })
  const form = new FormData()
  form.set('file', new Blob([new Uint8Array(req.body)], { type: req.get('content-type') || 'audio/wav' }), 'recording.wav')
  form.set('model', config.sttModel)
  form.set('response_format', 'verbose_json')
  form.set('word_timestamps', 'true')
  form.set('max_tokens', '128')
  if (config.sttLanguage) form.set('language', config.sttLanguage)
  try {
    const upstream = await fetch(config.sttUrl, { method: 'POST', body: form, signal: AbortSignal.timeout(120_000) })
    if (!upstream.ok) throw new Error(`STT returned HTTP ${upstream.status}: ${(await upstream.text()).slice(0, 240)}`)
    const data = await upstream.json() as {
      text?: string
      segments?: Array<{ words?: Array<{ word?: string; probability?: number }> }>
    }
    // Rebuilding from timestamped words drops the low-confidence tokens Whisper can
    // emit after short utterances have ended. Fall back for models without words.
    const words = data.segments?.flatMap((segment) => segment.words || []) || []
    const filtered = words
      .filter((word) => word.word && (word.probability ?? 1) >= 0.01)
      .map((word) => word.word)
      .join('')
      .trim()
    res.json({ text: filtered || data.text?.trim() || '' })
  } catch (error) { res.status(502).json({ error: error instanceof Error ? error.message : String(error) }) }
})
app.post('/api/tts', async (req, res) => {
  const text = String(req.body?.text || '').trim()
  if (!text || text.length > 800) return res.status(400).json({ error: 'Text must contain 1–800 characters' })
  const controller = new AbortController()
  res.on('close', () => { if (!res.writableEnded) controller.abort() })
  try {
    const upstream = await fetch(config.ttsUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)]),
      body: JSON.stringify({ model: config.ttsModel, input: text, voice: config.ttsVoice, response_format: 'wav', speed: 1.0 }),
    })
    if (!upstream.ok || !upstream.body) throw new Error(`TTS returned HTTP ${upstream.status}: ${(await upstream.text()).slice(0, 240)}`)
    res.set({ 'Content-Type': upstream.headers.get('content-type') || 'audio/wav', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' })
    for await (const chunk of upstream.body as any) res.write(chunk)
    res.end()
  } catch (error) { if (!res.headersSent) res.status(502).json({ error: error instanceof Error ? error.message : String(error) }); else res.end() }
})

const dist = path.resolve('dist')
app.use(express.static(dist))
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')))

const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })
wss.on('connection', (socket) => {
  const send = (event: Record<string, unknown>) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event)) }
  const session = new AgentSession(send)
  send({ type: 'ready' })
  socket.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString())
      if (message.type === 'prompt' && typeof message.text === 'string' && message.text.trim()) void session.prompt(message.text.trim())
      else if (message.type === 'cancel') session.cancel()
      else if (message.type === 'reset') session.reset()
    } catch { send({ type: 'error', message: 'Invalid client message' }) }
  })
  socket.on('close', () => session.cancel())
})

server.listen(config.port, '127.0.0.1', () => console.log(`Jarvis server listening on http://127.0.0.1:${config.port}`))
