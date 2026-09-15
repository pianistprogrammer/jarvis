import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { toSpokenText } from './spoken'

type Status = 'connecting' | 'listening' | 'hearing' | 'transcribing' | 'thinking' | 'working' | 'compacting' | 'speaking' | 'muted' | 'error'
type Message = { role: 'user' | 'assistant'; text: string }
type Models = { profile: string; llmModel: string; sttModel: string; ttsModel: string; ttsVoice: string }

const Icon = ({ name }: { name: 'mic' | 'stop' | 'send' | 'browser' | 'settings' | 'reset' }) => {
  const paths = {
    mic: <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="3"/>,
    send: <><path d="m3 11 18-8-8 18-2-8-8-2Z"/><path d="m11 13 5-5"/></>,
    browser: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63h.01A1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9v.01A1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"/></>,
    reset: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

function pcm16Base64(samples: Float32Array, inputRate: number) {
  const targetRate = 16_000, ratio = inputRate / targetRate
  const length = Math.floor(samples.length / ratio), bytes = new Uint8Array(length * 2)
  const view = new DataView(bytes.buffer)
  for (let i = 0; i < length; i++) view.setInt16(i * 2, Math.max(-1, Math.min(1, samples[Math.floor(i * ratio)])) * 0x7fff, true)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
} 

function App() {
  const [status, setStatus] = useState<Status>('connecting')
  const [muted, setMuted] = useState(false)
  const [level, setLevel] = useState(0)
  const [partial, setPartial] = useState('')
  const [liveTranscript, setLiveTranscript] = useState('')
  const [logs, setLogs] = useState<{ time: string; message: string }[]>([])
  const [debugOpen, setDebugOpen] = useState(false)
  const [latencyStart, setLatencyStart] = useState<number | null>(null)
  const [latencyMs, setLatencyMs] = useState<number | null>(null)
  const [context, setContext] = useState<{ used: number; limit: number } | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [browserOpen, setBrowserOpen] = useState(false)
  const [input, setInput] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [models, setModels] = useState<Models | null>(null)
  const [error, setError] = useState('')
  const mutedRef = useRef(false)
  const socketRef = useRef<WebSocket | null>(null)
  const sttSocketRef = useRef<WebSocket | null>(null)
  const sttPendingRef = useRef<string[]>([])
  const sttTranscriptRef = useRef('')
  const assistantRef = useRef('')
  const phraseRef = useRef('')
  const speechGeneration = useRef(0)
  const sources = useRef<AudioBufferSourceNode[]>([])
  const audioContext = useRef<AudioContext | null>(null)
  const speakingQueue = useRef<Promise<AudioBuffer | null>[]>([])
  const speechRequests = useRef<AbortController[]>([])
  const playing = useRef(false)
  const latencyStartRef = useRef<number | null>(null)
  const agentStatus = useRef<Status>('listening')
  const speechDecodeChain = useRef<Promise<void>>(Promise.resolve())
  const addLog = useCallback((message: string) => {
    setLogs((old) => [...old.slice(-99), { time: new Date().toLocaleTimeString(), message }])
  }, [])

  const cancelSpeech = useCallback(() => {
    speechGeneration.current++
    speechDecodeChain.current = Promise.resolve()
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
      if (latencyStartRef.current !== null) { setLatencyMs(performance.now() - latencyStartRef.current); setLatencyStart(null); latencyStartRef.current = null; addLog('first TTS audio playback started') }
      setStatus('speaking'); setLevel(.7)
      await new Promise<void>((resolve) => { source.onended = () => resolve(); source.start() })
      sources.current = sources.current.filter((x) => x !== source)
    }
    if (generation === speechGeneration.current) {
      playing.current = false; setLevel(0)
      setStatus(mutedRef.current ? 'muted' : agentStatus.current)
    }
  }, [addLog])

  const queueSpeech = useCallback((text: string) => {
    const cleaned = toSpokenText(text)
    if (!cleaned) return
    const generation = speechGeneration.current
    const controller = new AbortController(); speechRequests.current.push(controller)
    const response = fetch('/api/tts', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: cleaned }) })
    void response.catch(() => {})
    speechDecodeChain.current = speechDecodeChain.current.then(async () => {
        const r = await response
        if (generation !== speechGeneration.current) return
        if (!r.ok || !r.body) throw new Error((await r.json()).error || `TTS HTTP ${r.status}`)
        const reader = r.body.getReader(); let pending = new Uint8Array()
        while (true) {
          const { done, value } = await reader.read(); if (done) break
          const merged = new Uint8Array(pending.length + value.length); merged.set(pending); merged.set(value, pending.length); pending = merged
          while (pending.length >= 4) {
            const size = new DataView(pending.buffer, pending.byteOffset, 4).getUint32(0, true)
            if (pending.length < size + 4) break
            const chunk = pending.slice(4, size + 4); pending = pending.slice(size + 4)
            const ctx = audioContext.current || new AudioContext(); audioContext.current = ctx
            const audio = await ctx.decodeAudioData(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength))
            if (generation !== speechGeneration.current) return
            speakingQueue.current.push(Promise.resolve(audio)); void pumpSpeech(generation)
          }
        }
      })
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message) })
      .finally(() => { speechRequests.current = speechRequests.current.filter((x) => x !== controller) })
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
    if (latencyStart === null) return
    const timer = window.setInterval(() => setLatencyMs(performance.now() - latencyStart), 100)
    return () => clearInterval(timer)
  }, [latencyStart])

  useEffect(() => {
    fetch('/api/config').then((r) => r.json()).then(setModels).catch(() => {})
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${location.host}/ws`); socketRef.current = ws
    ws.onmessage = ({ data }) => {
      const event = JSON.parse(data)
      if (event.type === 'debug') addLog(event.message)
      if (event.type === 'context') setContext({ used: event.used, limit: event.limit })
      if (event.type === 'ready') setStatus('listening')
      if (event.type === 'status') { agentStatus.current = event.value; if (!playing.current || event.value === 'compacting') setStatus(event.value) }
      if (event.type === 'notice') { addLog(event.text); queueSpeech(event.text) }
      if (event.type === 'assistant_segment') { flushPhrases(true); assistantRef.current = ''; setPartial('') }
      if (event.type === 'user') setMessages((old) => [...old, { role: 'user', text: event.text }])
      if (event.type === 'assistant_delta') { assistantRef.current += event.text; phraseRef.current += event.text; setPartial(assistantRef.current); flushPhrases() }
      if (event.type === 'assistant_done') { flushPhrases(true); setMessages((old) => [...old, { role: 'assistant', text: event.text }]); assistantRef.current = ''; setPartial('') }
      if (event.type === 'browser_active') setBrowserOpen(true)
      if (event.type === 'error') { setError(event.message); setStatus('error') }
      if (event.type === 'reset') { setMessages([]); setContext(null); setPartial(''); setLiveTranscript(''); sttTranscriptRef.current = '' }
    }
    ws.onerror = () => { setError('Could not reach the local agent server'); setStatus('error') }

    const stt = new WebSocket(`${protocol}://${location.host}/stt`); sttSocketRef.current = stt
    stt.onopen = () => {
      addLog('realtime STT connection opened')
      stt.send(JSON.stringify({ type: 'session.update', session: { audio: { input: { format: { type: 'audio/pcm', rate: 16000 }, turn_detection: null } } } }))
      for (const message of sttPendingRef.current) stt.send(message)
      sttPendingRef.current = []
    }
    stt.onmessage = ({ data }) => {
      const event = JSON.parse(data)
      if (typeof event.text === 'string') {
        if (event.is_partial) { sttTranscriptRef.current = event.text; setLiveTranscript(event.text); setStatus('hearing'); addLog(`STT partial (${event.text.length} chars)`) }
        else {
          const text = event.text.trim(); sttTranscriptRef.current = ''; setLiveTranscript(''); addLog(`STT final (${text.length} chars)`)
          if (text) { setStatus('thinking'); socketRef.current?.send(JSON.stringify({ type: 'prompt', text })) }
          else setStatus('listening')
        }
      }
      if (event.error) { setError(event.error.message || 'Realtime transcription failed'); setStatus('error') }
      if (event.type === 'error') { setError(event.error?.message || 'Realtime transcription failed'); setStatus('error') }
    }
    stt.onerror = () => { setError('Could not reach realtime transcription'); setStatus('error') }
    return () => { ws.close(); stt.close(); sttSocketRef.current = null }
  }, [flushPhrases, addLog, queueSpeech])


  useEffect(() => {
    if (muted) return
    let stopped = false, stream: MediaStream, ctx: AudioContext, processor: ScriptProcessorNode
    let preRoll: Float32Array[] = [], speechMs = 0, silenceMs = 0, active = false
    const sendAudio = (samples: Float32Array, rate: number) => {
      const message = JSON.stringify({ type: 'input_audio_buffer.append', audio: pcm16Base64(samples, rate) })
      const stt = sttSocketRef.current
      if (stt?.readyState === WebSocket.OPEN) stt.send(message); else sttPendingRef.current.push(message)
    }
    const sendControl = (type: string) => {
      const message = JSON.stringify({ type: `input_audio_buffer.${type}` })
      const stt = sttSocketRef.current
      if (stt?.readyState === WebSocket.OPEN) stt.send(message); else sttPendingRef.current.push(message)
    }
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }).then((media) => {
      if (stopped) { media.getTracks().forEach((x) => x.stop()); return }
      stream = media; ctx = new AudioContext(); const source = ctx.createMediaStreamSource(media); processor = ctx.createScriptProcessor(2048, 1, 1)
      processor.onaudioprocess = (event) => {
        const samples = new Float32Array(event.inputBuffer.getChannelData(0)); const rms = Math.sqrt(samples.reduce((n, x) => n + x * x, 0) / samples.length)
        setLevel(Math.min(1, rms * 14)); const frameMs = samples.length / ctx.sampleRate * 1000
        if (!active) {
          preRoll.push(samples); if (preRoll.length > 8) preRoll.shift()
          speechMs = rms > .035 ? speechMs + frameMs : 0
          if (speechMs >= 220) {
            active = true; silenceMs = 0; setStatus('hearing'); cancelSpeech(); socketRef.current?.send(JSON.stringify({ type: 'cancel' })); sendControl('speech_started')
            preRoll.forEach((chunk) => sendAudio(chunk, ctx.sampleRate)); preRoll = []
          }
        } else {
          sendAudio(samples, ctx.sampleRate); silenceMs = rms < .022 ? silenceMs + frameMs : 0
          if (silenceMs >= 1000) {
            active = false; preRoll = []; speechMs = 0; setStatus('transcribing')
            const started = performance.now(); latencyStartRef.current = started; setLatencyStart(started); setLatencyMs(0); addLog('VAD detected end of speech'); sendControl('commit')
          }
        }
      }
      source.connect(processor); processor.connect(ctx.destination); setStatus('listening')
    }).catch((e) => { setError(`Microphone: ${e.message}`); setMuted(true) })
    return () => { stopped = true; processor?.disconnect(); void ctx?.close(); stream?.getTracks().forEach((x) => x.stop()) }
  }, [muted, cancelSpeech, addLog])


  const submit = () => { const text = input.trim(); if (!text) return; cancelSpeech(); socketRef.current?.send(JSON.stringify({ type: 'prompt', text })); setInput('') }
  const reset = () => { cancelSpeech(); socketRef.current?.send(JSON.stringify({ type: 'reset' })); sttTranscriptRef.current = ''; setLiveTranscript('') }
  const statusLabel: Record<Status, string> = { connecting: 'Connecting', listening: 'Listening', hearing: 'I’m listening…', transcribing: 'Transcribing', thinking: 'Thinking', working: 'Working', compacting: 'Summarizing memory', speaking: 'Speaking', muted: 'Microphone muted', error: 'Needs attention' }
  return <main className={`app status-${status} ${browserOpen ? 'with-browser' : ''}`}>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">J</span><span>Jarvis</span></div>
      <button className="new-session" onClick={reset}><span>＋</span> New conversation</button>
      <div className="history-label">Today</div>
      <button className="history-item active"><span className="pulse-dot"/>Local voice session <small>{messages.length || ''}</small></button>
      <div className="sidebar-foot"><div className="local-pill"><span/> Local · Apple silicon</div><button aria-label="Settings" onClick={() => setSettingsOpen(true)}><Icon name="settings"/></button></div>
    </aside>

    <section className="stage">
      <header><div><span className="eyebrow">PRIVATE WORKSPACE</span><h1>Local voice session</h1></div><div className="header-right"><div className="latency" title="Current LLM prompt context"><span>CONTEXT</span><b>{context ? `${(context.used / 1000).toFixed(1)}K / ${Math.round(context.limit / 1024)}K` : '—'}</b></div><div className="latency" title="Time from VAD speech-stop to first voice audio"><span>RESPONSE</span><b>{latencyMs === null ? '—' : `${(latencyMs / 1000).toFixed(2)}s`}</b></div><button className="debug-toggle" onClick={() => setDebugOpen((open) => !open)}>{debugOpen ? 'Hide logs' : 'Logs'}</button><div className="header-actions"><button onClick={reset} title="Reset conversation"><Icon name="reset"/></button><button onClick={() => setSettingsOpen(true)} title="Model settings"><Icon name="settings"/></button></div></div></header>
      <div className="workspace">
        {debugOpen && <section className="debug-panel"><div className="debug-head"><div><span className="eyebrow">BACKEND LOG</span><b>Live diagnostics</b></div><button onClick={() => setLogs([])}>Clear</button></div><div className="debug-lines">{logs.length ? logs.map((entry, index) => <div className="debug-line" key={`${entry.time}-${index}`}><time>{entry.time}</time><span>{entry.message}</span></div>) : <div className="debug-empty">Waiting for backend events…</div>}</div></section>}
        {browserOpen && <section className="browser-panel"><div className="panel-head"><div><Icon name="browser"/><span>Browser workspace</span><i>LIVE</i></div><button onClick={() => setBrowserOpen(false)} title="Hide browser">×</button></div><iframe className="browser-frame" src="/browser-ui/" title="Interactive agent browser" allow="clipboard-read; clipboard-write; fullscreen" /></section>}

        <section className="voice-stage">
          <div className="orb-wrap" style={{ '--level': level } as React.CSSProperties}>
            <div className="orbit orbit-a"/><div className="orbit orbit-b"/><div className="orb-glow"/><div className="orb"><div className="orb-core"/></div>
          </div>
          <div className="status-copy"><h2>{statusLabel[status]}</h2><p>{liveTranscript || partial || (status === 'listening' ? 'Speak naturally — I’ll detect when you finish.' : status === 'muted' ? 'Type below or unmute when you’re ready.' : 'Your models and tools are working locally.')}</p></div>
          <div className="voice-controls">
            <button className={muted ? 'mic muted' : 'mic'} onClick={() => setMuted((x) => { const next = !x; setStatus(next ? 'muted' : 'listening'); return next })} aria-label={muted ? 'Unmute' : 'Mute'}><Icon name="mic"/></button>
            <button className="end" onClick={() => { cancelSpeech(); socketRef.current?.send(JSON.stringify({ type: 'cancel' })); setStatus('muted'); setMuted(true) }} aria-label="Stop"><Icon name="stop"/></button>
          </div>
        </section>

      </div>

      <div className="composer"><input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit() }} placeholder="Type a message…"/><button onClick={submit} disabled={!input.trim()}><Icon name="send"/></button></div>
      {error && <button className="error-toast" onClick={() => setError('')}>{error}<span>×</span></button>}
    </section>

    {settingsOpen && <div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}><section className="modal" onMouseDown={(e) => e.stopPropagation()}>
      <button className="modal-close" onClick={() => setSettingsOpen(false)}>×</button><span className="eyebrow">RUNTIME</span><h2>Apple silicon stack</h2><p>These adapters use local OpenAI-compatible endpoints. Change them in <code>.env</code>.</p>
      <div className="model-row"><span>Brain</span><div><b>{models?.llmModel || 'Loading…'}</b><small>llama.cpp · Metal</small></div></div>
      <div className="model-row"><span>Ears</span><div><b>{models?.sttModel || 'Loading…'}</b><small>Realtime STT · MLX</small></div></div>
      <div className="model-row"><span>Voice</span><div><b>{models?.ttsModel || 'Loading…'}</b><small>{models?.ttsVoice} · MLX</small></div></div>
      <div className="privacy-note">{models?.profile === 'full' ? 'Full 32–48 GB profile detected.' : 'Compact 8–16 GB profile detected.'} Audio and prompts stay on this Mac when local endpoints are used.</div>
    </section></div>}
  </main>
}

export default App
