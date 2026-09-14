import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

type Status = 'connecting' | 'listening' | 'hearing' | 'transcribing' | 'thinking' | 'working' | 'speaking' | 'muted' | 'error'
type Message = { role: 'user' | 'assistant'; text: string }
type ToolEvent = { id: string; name: string; detail: string; state: 'running' | 'done' | 'error' }
type Models = { profile: string; llmModel: string; sttModel: string; ttsModel: string; ttsVoice: string }

const Icon = ({ name }: { name: 'mic' | 'stop' | 'send' | 'browser' | 'terminal' | 'settings' | 'reset' }) => {
  const paths = {
    mic: <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="3"/>,
    send: <><path d="m3 11 18-8-8 18-2-8-8-2Z"/><path d="m11 13 5-5"/></>,
    browser: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/></>,
    terminal: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63h.01A1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9v.01A1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"/></>,
    reset: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

function wavBlob(chunks: Float32Array[], inputRate: number) {
  const length = chunks.reduce((n, x) => n + x.length, 0)
  const source = new Float32Array(length); let offset = 0
  for (const chunk of chunks) { source.set(chunk, offset); offset += chunk.length }
  const targetRate = 16_000, ratio = inputRate / targetRate
  const mono = new Float32Array(Math.floor(source.length / ratio))
  for (let i = 0; i < mono.length; i++) mono[i] = source[Math.floor(i * ratio)]
  const buffer = new ArrayBuffer(44 + mono.length * 2), view = new DataView(buffer)
  const word = (at: number, text: string) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
  word(0, 'RIFF'); view.setUint32(4, 36 + mono.length * 2, true); word(8, 'WAVE'); word(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, targetRate, true)
  view.setUint32(28, targetRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); word(36, 'data'); view.setUint32(40, mono.length * 2, true)
  mono.forEach((sample, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true))
  return new Blob([buffer], { type: 'audio/wav' })
}

function App() {
  const [status, setStatus] = useState<Status>('connecting')
  const [muted, setMuted] = useState(false)
  const [level, setLevel] = useState(0)
  const [partial, setPartial] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [tools, setTools] = useState<ToolEvent[]>([])
  const [browserOpen, setBrowserOpen] = useState(false)
  const [browserTick, setBrowserTick] = useState(0)
  const [input, setInput] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [models, setModels] = useState<Models | null>(null)
  const [error, setError] = useState('')
  const mutedRef = useRef(false)
  const socketRef = useRef<WebSocket | null>(null)
  const assistantRef = useRef('')
  const phraseRef = useRef('')
  const speechGeneration = useRef(0)
  const sources = useRef<AudioBufferSourceNode[]>([])
  const audioContext = useRef<AudioContext | null>(null)
  const speakingQueue = useRef<Promise<AudioBuffer | null>[]>([])
  const speechRequests = useRef<AbortController[]>([])
  const playing = useRef(false)

  const cancelSpeech = useCallback(() => {
    speechGeneration.current++
    sources.current.forEach((x) => { try { x.stop() } catch { /* already stopped */ } })
    speechRequests.current.forEach((x) => x.abort())
    sources.current = []; speechRequests.current = []; speakingQueue.current = []; playing.current = false; phraseRef.current = ''
  }, [])

  const pumpSpeech = useCallback(async (generation: number) => {
    if (playing.current) return
    playing.current = true
    while (speakingQueue.current.length && generation === speechGeneration.current) {
      const audio = await speakingQueue.current.shift()
      if (!audio || generation !== speechGeneration.current) continue
      const ctx = audioContext.current || new AudioContext(); audioContext.current = ctx
      const source = ctx.createBufferSource(); source.buffer = audio; source.connect(ctx.destination); sources.current.push(source)
      setStatus('speaking'); setLevel(.7)
      await new Promise<void>((resolve) => { source.onended = () => resolve(); source.start() })
      sources.current = sources.current.filter((x) => x !== source)
    }
    playing.current = false; setLevel(0)
    if (generation === speechGeneration.current) setStatus(mutedRef.current ? 'muted' : 'listening')
  }, [])

  const queueSpeech = useCallback((text: string) => {
    const cleaned = text.replace(/```[\s\S]*?```/g, ' I put the technical details on screen. ').replace(/[*_#`]/g, '').trim()
    if (!cleaned) return
    const generation = speechGeneration.current
    const controller = new AbortController(); speechRequests.current.push(controller)
    const task = fetch('/api/tts', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: cleaned }) })
      .then(async (r) => { if (!r.ok) throw new Error((await r.json()).error || `TTS HTTP ${r.status}`); const ctx = audioContext.current || new AudioContext(); audioContext.current = ctx; return ctx.decodeAudioData(await r.arrayBuffer()) })
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message); return null })
      .finally(() => { speechRequests.current = speechRequests.current.filter((x) => x !== controller) })
    speakingQueue.current.push(task)
    void pumpSpeech(generation)
  }, [pumpSpeech])

  const flushPhrases = useCallback((final = false) => {
    let value = phraseRef.current
    const boundary = /^(.*?[.!?](?:["')\]]+)?)(?:\s+|$)/s
    while (true) {
      const match = value.match(boundary)
      if (!match || (match[1].length < 18 && !final)) break
      queueSpeech(match[1]); value = value.slice(match[0].length)
    }
    if (!final && value.length > 220) { const cut = value.lastIndexOf(' ', 200); queueSpeech(value.slice(0, cut > 80 ? cut : 200)); value = value.slice(cut > 80 ? cut : 200) }
    if (final && value.trim()) queueSpeech(value)
    phraseRef.current = value
  }, [queueSpeech])

  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  useEffect(() => {
    fetch('/api/config').then((r) => r.json()).then(setModels).catch(() => {})
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${location.host}/ws`); socketRef.current = ws
    ws.onmessage = ({ data }) => {
      const event = JSON.parse(data)
      if (event.type === 'ready') setStatus('listening')
      if (event.type === 'status' && event.value !== 'listening') setStatus(event.value)
      if (event.type === 'user') setMessages((old) => [...old, { role: 'user', text: event.text }])
      if (event.type === 'assistant_delta') { assistantRef.current += event.text; phraseRef.current += event.text; setPartial(assistantRef.current); flushPhrases() }
      if (event.type === 'assistant_done') { flushPhrases(true); setMessages((old) => [...old, { role: 'assistant', text: event.text }]); assistantRef.current = ''; setPartial('') }
      if (event.type === 'tool_start') setTools((old) => [...old.slice(-3), { id: event.id, name: event.name, detail: String(event.detail || ''), state: 'running' }])
      if (event.type === 'tool_end') setTools((old) => old.map((x) => x.id === event.id ? { ...x, state: event.ok ? 'done' : 'error' } : x))
      if (event.type === 'browser_active') setBrowserOpen(true)
      if (event.type === 'error') { setError(event.message); setStatus('error') }
      if (event.type === 'reset') { setMessages([]); setTools([]); setPartial('') }
    }
    ws.onerror = () => { setError('Could not reach the local agent server'); setStatus('error') }
    return () => ws.close()
  }, [flushPhrases])

  useEffect(() => {
    if (!browserOpen) return
    const timer = window.setInterval(() => setBrowserTick((x) => x + 1), 1200)
    return () => clearInterval(timer)
  }, [browserOpen])

  useEffect(() => {
    if (muted) return
    let stopped = false, stream: MediaStream, ctx: AudioContext, processor: ScriptProcessorNode
    let preRoll: Float32Array[] = [], recording: Float32Array[] = [], speechMs = 0, silenceMs = 0, active = false
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }).then((media) => {
      if (stopped) { media.getTracks().forEach((x) => x.stop()); return }
      stream = media; ctx = new AudioContext(); const source = ctx.createMediaStreamSource(media); processor = ctx.createScriptProcessor(2048, 1, 1)
      processor.onaudioprocess = (event) => {
        const samples = new Float32Array(event.inputBuffer.getChannelData(0)); const rms = Math.sqrt(samples.reduce((n, x) => n + x * x, 0) / samples.length)
        setLevel(Math.min(1, rms * 14)); const frameMs = samples.length / ctx.sampleRate * 1000
        if (!active) {
          preRoll.push(samples); if (preRoll.length > 8) preRoll.shift()
          speechMs = rms > .035 ? speechMs + frameMs : 0
          if (speechMs >= 220) { active = true; recording = [...preRoll]; silenceMs = 0; setStatus('hearing'); cancelSpeech(); socketRef.current?.send(JSON.stringify({ type: 'cancel' })) }
        } else {
          recording.push(samples); silenceMs = rms < .022 ? silenceMs + frameMs : 0
          if (silenceMs >= 850) {
            active = false; const clip = recording; recording = []; preRoll = []; speechMs = 0; setStatus('transcribing')
            void fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wavBlob(clip, ctx.sampleRate) }).then(async (r) => {
              const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Transcription failed')
              if (data.text) socketRef.current?.send(JSON.stringify({ type: 'prompt', text: data.text })); else setStatus('listening')
            }).catch((e) => { setError(e.message); setStatus('error') })
          }
        }
      }
      source.connect(processor); processor.connect(ctx.destination); setStatus('listening')
    }).catch((e) => { setError(`Microphone: ${e.message}`); setMuted(true) })
    return () => { stopped = true; processor?.disconnect(); void ctx?.close(); stream?.getTracks().forEach((x) => x.stop()) }
  }, [muted, cancelSpeech])

  const submit = () => { const text = input.trim(); if (!text) return; cancelSpeech(); socketRef.current?.send(JSON.stringify({ type: 'prompt', text })); setInput('') }
  const reset = () => { cancelSpeech(); socketRef.current?.send(JSON.stringify({ type: 'reset' })) }
  const statusLabel: Record<Status, string> = { connecting: 'Connecting', listening: 'Listening', hearing: 'I’m listening…', transcribing: 'Transcribing', thinking: 'Thinking', working: 'Using tools', speaking: 'Speaking', muted: 'Microphone muted', error: 'Needs attention' }

  return <main className={`app status-${status} ${browserOpen ? 'with-browser' : ''}`}>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">A</span><span>Aura</span></div>
      <button className="new-session" onClick={reset}><span>＋</span> New conversation</button>
      <div className="history-label">Today</div>
      <button className="history-item active"><span className="pulse-dot"/>Local voice session <small>{messages.length || ''}</small></button>
      <div className="sidebar-foot"><div className="local-pill"><span/> Local · Apple silicon</div><button aria-label="Settings" onClick={() => setSettingsOpen(true)}><Icon name="settings"/></button></div>
    </aside>

    <section className="stage">
      <header><div><span className="eyebrow">PRIVATE WORKSPACE</span><h1>Local voice session</h1></div><div className="header-actions"><button onClick={reset} title="Reset conversation"><Icon name="reset"/></button><button onClick={() => setSettingsOpen(true)} title="Model settings"><Icon name="settings"/></button></div></header>

      <div className="workspace">
        {browserOpen && <section className="browser-panel">
          <div className="panel-head"><div><Icon name="browser"/><span>Agent browser</span><i>LIVE</i></div><button onClick={() => setBrowserOpen(false)}>×</button></div>
          <div className="urlbar"><span>●</span> Persistent Chromium · controlled by Aura</div>
          <img src={`/api/browser/screenshot?t=${browserTick}`} alt="Live view of the agent-controlled browser" onError={(e) => { e.currentTarget.style.opacity = '.2' }} />
        </section>}

        <section className="voice-stage">
          <div className="orb-wrap" style={{ '--level': level } as React.CSSProperties}>
            <div className="orbit orbit-a"/><div className="orbit orbit-b"/><div className="orb-glow"/><div className="orb"><div className="orb-core"/></div>
          </div>
          <div className="status-copy"><h2>{statusLabel[status]}</h2><p>{partial || (status === 'listening' ? 'Speak naturally — I’ll detect when you finish.' : status === 'muted' ? 'Type below or unmute when you’re ready.' : 'Your models and tools are working locally.')}</p></div>
          <div className="voice-controls">
            <button className={muted ? 'mic muted' : 'mic'} onClick={() => setMuted((x) => { const next = !x; setStatus(next ? 'muted' : 'listening'); return next })} aria-label={muted ? 'Unmute' : 'Mute'}><Icon name="mic"/></button>
            <button className="end" onClick={() => { cancelSpeech(); socketRef.current?.send(JSON.stringify({ type: 'cancel' })); setStatus('muted'); setMuted(true) }} aria-label="Stop"><Icon name="stop"/></button>
          </div>
        </section>

        {!!tools.length && <div className="tool-stack">{tools.slice(-4).map((tool) => <article className={`tool-card ${tool.state}`} key={tool.id}>
          <span className="tool-icon">{tool.name.startsWith('browser') ? <Icon name="browser"/> : <Icon name="terminal"/>}</span>
          <div><b>{tool.name.replaceAll('_', ' ')}</b><small>{tool.detail || (tool.state === 'running' ? 'In progress…' : tool.state)}</small></div><span className="tool-state">{tool.state === 'running' ? '···' : tool.state === 'done' ? '✓' : '!'}</span>
        </article>)}</div>}
      </div>

      <div className="composer"><input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit() }} placeholder="Type a message…"/><button onClick={submit} disabled={!input.trim()}><Icon name="send"/></button></div>
      {error && <button className="error-toast" onClick={() => setError('')}>{error}<span>×</span></button>}
    </section>

    {settingsOpen && <div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}><section className="modal" onMouseDown={(e) => e.stopPropagation()}>
      <button className="modal-close" onClick={() => setSettingsOpen(false)}>×</button><span className="eyebrow">RUNTIME</span><h2>Apple silicon stack</h2><p>These adapters use local OpenAI-compatible endpoints. Change them in <code>.env</code>.</p>
      <div className="model-row"><span>Brain</span><div><b>{models?.llmModel || 'Loading…'}</b><small>llama.cpp · Metal</small></div></div>
      <div className="model-row"><span>Ears</span><div><b>{models?.sttModel || 'Loading…'}</b><small>Whisper · MLX</small></div></div>
      <div className="model-row"><span>Voice</span><div><b>{models?.ttsModel || 'Loading…'}</b><small>{models?.ttsVoice} · MLX</small></div></div>
      <div className="privacy-note">{models?.profile === 'full' ? 'Full 32–48 GB profile detected.' : 'Compact 8–16 GB profile detected.'} Audio and prompts stay on this Mac when local endpoints are used.</div>
    </section></div>}
  </main>
}

export default App
