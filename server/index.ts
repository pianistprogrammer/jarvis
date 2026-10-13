import express from 'express'
import { createServer } from 'node:http'
import { mkdir } from 'node:fs/promises'
import fs from 'node:fs'
import path from 'node:path'
import { WebSocketServer, WebSocket } from 'ws'
import { config } from './config.js'
import { agentBrowser } from './browser.js'
import { AgentSession } from './agent.js'
import { frameAudioChunk } from './audio-stream.js'
import { attachBrowserUpgrade, mountBrowserProxy } from './browser-proxy.js'
// AgentHarness backend integration
import { createHarnessIntegration } from './agent-harness-integration.js'

await mkdir(config.workspace, { recursive: true })
const app = express()
app.disable('x-powered-by')
// Mount AgentHarness routes and features
createHarnessIntegration(app)
app.use(express.json({ limit: '2mb' }))


app.get('/api/health', (_req, res) => res.json({ ok: true, profile: config.profile, model: config.llmModel, workspace: config.workspace }))
app.get('/api/config', (_req, res) => res.json({ profile: config.profile, llmModel: config.llmModel, sttModel: config.sttModel, ttsProvider: config.ttsProvider, ttsModel: config.ttsModel, ttsVoice: config.ttsVoice }))
app.get('/api/browser/status', (_req, res) => res.json(agentBrowser.status()))
app.get('/api/browser/screenshot', async (_req, res) => {
  try { res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' }).send(await agentBrowser.screenshot()) }
  catch { res.sendStatus(404) }
})
app.post('/api/browser/input', async (req, res) => {
  try { res.json(await agentBrowser.input(req.body?.action, req.body || {})) }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }) }
})
app.post('/api/browser/tabs/new', async (req, res) => {
  try { res.json(await agentBrowser.newTab(String(req.body?.url || 'about:blank'))) }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }) }
})
app.post('/api/browser/tabs/close', async (_req, res) => {
  try { res.json(await agentBrowser.closeTab()) }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }) }
})
app.post('/api/transcribe', express.raw({ type: ['audio/wav', 'audio/webm', 'application/octet-stream'], limit: '16mb' }), async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Audio is required' })
  const form = new FormData()
  form.set('file', new Blob([new Uint8Array(req.body)], { type: req.get('content-type') || 'audio/wav' }), 'recording.wav')
  form.set('model', config.sttModel)
  form.set('response_format', 'json')
  try {
    const upstream = await fetch(config.sttUrl, { method: 'POST', body: form, signal: AbortSignal.timeout(120_000) })
    if (!upstream.ok) throw new Error(`STT returned HTTP ${upstream.status}: ${(await upstream.text()).slice(0, 240)}`)
    const data = await upstream.json() as { text?: string }
    res.json({ text: data.text?.trim() || '' })
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
      body: JSON.stringify({ model: config.ttsModel, input: text, voice: config.ttsVoice, instruct: config.ttsInstruct, lang_code: config.ttsLangCode, temperature: config.ttsTemperature, top_p: config.ttsTopP, top_k: config.ttsTopK, repetition_penalty: config.ttsRepetitionPenalty, response_format: 'wav', speed: config.ttsSpeed, stream: true, streaming_interval: config.ttsStreamingInterval }),
    })
    if (!upstream.ok || !upstream.body) throw new Error(`TTS returned HTTP ${upstream.status}: ${(await upstream.text()).slice(0, 240)}`)
    res.set({ 'Content-Type': 'application/x-jarvis-audio-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' })
    let pending = Buffer.alloc(0)
    for await (const chunk of upstream.body as any) {
      pending = Buffer.concat([pending, Buffer.from(chunk)])
      while (pending.length >= 44 && pending.toString('ascii', 0, 4) === 'RIFF') {
        const size = pending.readUInt32LE(4) + 8
        if (pending.length < size) break
        res.write(frameAudioChunk(pending.subarray(0, size))); pending = pending.subarray(size)
      }
    }
    if (pending.length) res.write(frameAudioChunk(pending))
    res.end()
  } catch (error) {
    if (!res.headersSent) res.status(502).json({ error: error instanceof Error ? error.message : String(error) })
    else res.destroy(error instanceof Error ? error : new Error(String(error)))
  }
})

const dist = path.resolve('dist')
// Duplex Lab endpoint for VAD-free 600ms adapter test
app.get('/api/duplex/status', (_req, res) => {
  res.json({ running: true, adapterPath: require('./config.js').config.duplexAdapterPath || '', endpointUrl: require('./config.js').config.duplexEndpointUrl || '', windowMs: 600 })
})
mountBrowserProxy(app)
app.use(express.static(dist))
app.get('/duplex-lab', (_req, res) => {
  try { res.type('html').send(fs.readFileSync(path.resolve(dist, 'duplex-lab.html'), 'utf8')) }
  catch { res.redirect('/') }
})
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')))

const server = createServer(app)
attachBrowserUpgrade(server)
const wss = new WebSocketServer({ noServer: true })
wss.on('connection', (socket) => {
  const send = (event: Record<string, unknown>) => {
    if (socket.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify(event))
    const diagnosticTypes = new Set(['ready', 'status', 'user', 'tool_start', 'tool_end', 'assistant_done', 'error', 'reset'])
    if (diagnosticTypes.has(String(event.type))) {
      const detail = event.type === 'status' ? `: ${String(event.value)}` : event.type === 'user' ? ` (${String(event.text).slice(0, 120)})` : event.type === 'tool_start' ? `: ${String(event.name)}` : event.type === 'tool_end' ? `: ${String(event.name)} ${event.ok ? 'succeeded' : 'failed'}` : event.type === 'assistant_done' ? ` (${String(event.text).length} chars)` : ''
      socket.send(JSON.stringify({ type: 'debug', message: `${String(event.type)}${detail}` }))
    }
  }
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
function pcmWav(audio: Buffer) {
  const wav = Buffer.alloc(44 + audio.length)
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + audio.length, 4); wav.write('WAVE', 8); wav.write('fmt ', 12)
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24)
  wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(audio.length, 40); audio.copy(wav, 44)
  return wav
}

const sttWss = new WebSocketServer({ noServer: true })
sttWss.on('connection', (client) => {
  let upstream: WebSocket
  let pending: Buffer[] = []
  let utterance: Buffer[] = []
  let inTurn = false

  const connectUpstream = () => {
    const realtimeUrl = new URL(config.sttUrl)
    realtimeUrl.protocol = realtimeUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    realtimeUrl.pathname = '/v1/audio/transcriptions/realtime'
    realtimeUrl.search = ''
    upstream = new WebSocket(realtimeUrl)
    upstream.on('open', () => {
      upstream.send(JSON.stringify({ model: config.sttModel, sample_rate: 16000, streaming: false }))
      for (const audio of pending) upstream.send(audio)
      pending = []
    })
    upstream.on('message', (raw) => { if (client.readyState === WebSocket.OPEN) client.send(raw) })
    upstream.on('error', (error) => {
      if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: 'error', error: { message: error.message } }))
    })
  }

  const finalize = async () => {
    const audio = Buffer.concat(utterance); utterance = []
    if (!audio.length) return
    const form = new FormData()
    form.set('file', new Blob([new Uint8Array(pcmWav(audio))], { type: 'audio/wav' }), 'recording.wav')
    form.set('model', config.sttModel); form.set('response_format', 'json')
    const response = await fetch(config.sttUrl, { method: 'POST', body: form })
    if (!response.ok) throw new Error(`STT final returned HTTP ${response.status}: ${(await response.text()).slice(0, 240)}`)
    const data = await response.json() as { text?: string }
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ text: data.text?.trim() || '', is_partial: false }))
  }

  connectUpstream()
  client.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString())
      if (message.type === 'input_audio_buffer.speech_started') { inTurn = true; utterance = []; return }
      if (message.type === 'input_audio_buffer.commit') {
        inTurn = false; pending = []; if (upstream.readyState === WebSocket.OPEN) upstream.close()
        void finalize().then(connectUpstream).catch((error) => {
          if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: 'error', error: { message: String(error) } }))
        })
        return
      }
      if (message.type !== 'input_audio_buffer.append' || typeof message.audio !== 'string') return
      const audio = Buffer.from(message.audio, 'base64')
      if (inTurn) utterance.push(audio)
      if (upstream.readyState === WebSocket.OPEN) upstream.send(audio)
      else pending.push(audio)
    } catch (error) {
      if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: 'error', error: { message: String(error) } }))
    }
  })
  client.on('close', () => { if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) upstream.close() })
})

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname
  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (client) => wss.emit('connection', client, request))
  } else if (pathname === '/stt') {
    sttWss.handleUpgrade(request, socket, head, (client) => sttWss.emit('connection', client, request))
  } else if (pathname.startsWith('/browser-ui')) {
    return
  }
})

server.listen(config.port, '127.0.0.1', () => console.log(`Jarvis server listening on http://127.0.0.1:${config.port}`))
