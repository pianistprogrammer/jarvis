import { useCallback, useEffect, useRef, useState } from 'react'
import { MicVAD } from '@ricky0123/vad-web'
import './App.css'
import { toSpokenText, takeSpeechChunks } from './spoken'
import { AudioTimeline } from './audio-timeline'
import { MessageList as HarnessMessageList } from './agent-harness/components/MessageList'
import { ChatInput as HarnessChatInput } from './agent-harness/components/ChatInput'
import { WelcomeScreen as HarnessWelcomeScreen } from './agent-harness/components/WelcomeScreen'
import type { Message as HarnessMessage, MessageData as HarnessMessageData } from './agent-harness/types'

type Status = 'connecting' | 'listening' | 'hearing' | 'transcribing' | 'thinking' | 'working' | 'compacting' | 'speaking' | 'muted' | 'error'
type Models = { profile: string; llmModel: string; sttModel: string; ttsProvider: string; ttsModel: string; ttsVoice: string }
type StoredSession = { id: string; title: string; createdAt: number; updatedAt: number; messages: HarnessMessage[] }

const SESSION_KEY = 'jarvis.sessions'
const ACTIVE_KEY = 'jarvis.activeSession'
const MAX_SESSIONS = 50

function loadSessions(): StoredSession[] {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((s): s is StoredSession => Boolean(s?.id) && Array.isArray(s?.messages)) : []
  } catch { return [] }
}

function persistSessions(sessions: StoredSession[]) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS))) } catch { /* storage full or unavailable */ }
}

function sessionTitle(text: string) {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > 44 ? `${clean.slice(0, 44)}…` : clean || 'New conversation'
}

const Icon = ({ name }: { name: 'mic' | 'stop' | 'send' | 'browser' | 'settings' | 'reset' }) => {
  const paths = {
    mic: <g><rect x="9" y="3" width="6" height="12" rx="3" fill="#aa3bff" stroke="none"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" stroke="#aa3bff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></g>,
    stop: <rect x="6" y="6" width="12" height="12" rx="3" fill="#aa3bff" stroke="none"/>,
    send: <g><path d="m3 11 18-8-8 18-2-8-8-2Z" fill="#aa3bff" stroke="none"/><path d="m11 13 5-5" stroke="#aa3bff" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></g>,
    browser: <g><rect x="3" y="4" width="18" height="16" rx="2" stroke="#aa3bff" strokeWidth="1.5" fill="none"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01" stroke="#aa3bff" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></g>,
    settings: <g><circle cx="12" cy="12" r="3" fill="#aa3bff" stroke="none"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63h.01A1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9v.01A1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" stroke="#aa3bff" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></g>,
    reset: <g><path d="M3 12a9 9 0 1 0 3-6.7L3 8" stroke="#aa3bff" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 3v5h5" stroke="#aa3bff" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></g>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>{paths[name]}</svg>
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

async function parseSocketData(data: string | Blob | ArrayBuffer): Promise<Record<string, any>> {
  const text = typeof data === 'string' ? data : data instanceof Blob ? await data.text() : new TextDecoder().decode(data)
  return JSON.parse(text) as Record<string, any>
}

function App() {
  const [status, setStatus] = useState<Status>('connecting')
  const [muted, setMuted] = useState(false)
  const [allowInterruptions, setAllowInterruptions] = useState(() => localStorage.getItem('jarvis.interruptions') !== 'false')
  const [level, setLevel] = useState(0)
  const [partial, setPartial] = useState('')
  const [liveTranscript, setLiveTranscript] = useState('')
  const [logs, setLogs] = useState<{ time: string; message: string }[]>([])
  const [debugOpen, setDebugOpen] = useState(false)
  const [latencyStart, setLatencyStart] = useState<number | null>(null)
  const [latencyMs, setLatencyMs] = useState<number | null>(null)
  const [context, setContext] = useState<{ used: number; limit: number } | null>(null)
  const [harnessMessages, setHarnessMessages] = useState<HarnessMessage[]>([])
  const [sessions, setSessions] = useState<StoredSession[]>(loadSessions)
  const [activeSessionId, setActiveSessionId] = useState<string>(() => localStorage.getItem(ACTIVE_KEY) || '')
  const [browserOpen, setBrowserOpen] = useState(false)
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
  const timeline = useRef(new AudioTimeline())
  const phraseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const speechRequests = useRef<AbortController[]>([])
  const playing = useRef(false)
  const latencyStartRef = useRef<number | null>(null)
  const agentStatus = useRef<Status>('listening')
  const harnessId = useRef(0)
  const speechDecodeChain = useRef<Promise<void>>(Promise.resolve())
  const vadActive = useRef(false)
  const addLog = useCallback((message: string) => {
    setLogs((old) => [...old.slice(-99), { time: new Date().toLocaleTimeString(), message }])
  }, [])
  const pushHarness = useCallback((data: HarnessMessageData) => {
    setHarnessMessages((old) => [...old, { id: `m${++harnessId.current}`, data }])
  }, [])
  const replaceHarness = useCallback((restored: HarnessMessage[]) => {
    harnessId.current = restored.length
    setHarnessMessages(restored.map((m, i) => ({ ...m, id: `m${i + 1}` })))
  }, [])

  useEffect(() => {
    if (!activeSessionId) return
    const hasContent = harnessMessages.some((m) => m.data.kind === 'user' || m.data.kind === 'response')
    setSessions((old) => {
      const existing = old.find((s) => s.id === activeSessionId)
      if (!existing && !hasContent) return old
      const firstUser = harnessMessages.find((m) => m.data.kind === 'user')
      const title = existing && existing.title !== 'New conversation' ? existing.title : sessionTitle(firstUser && firstUser.data.kind === 'user' ? firstUser.data.text : '')
      const next: StoredSession = { id: activeSessionId, title, createdAt: existing?.createdAt ?? Date.now(), updatedAt: Date.now(), messages: harnessMessages }
      return [next, ...old.filter((s) => s.id !== activeSessionId)]
    })
  }, [harnessMessages, activeSessionId])

  useEffect(() => { persistSessions(sessions) }, [sessions])
  useEffect(() => {
    if (activeSessionId) localStorage.setItem(ACTIVE_KEY, activeSessionId)
    else localStorage.removeItem(ACTIVE_KEY)
  }, [activeSessionId])

  useEffect(() => {
    if (activeSessionId) return
    const stored = loadSessions()
    const mostRecent = stored[0]
    if (mostRecent) {
      setActiveSessionId(mostRecent.id)
      replaceHarness(mostRecent.messages)
    } else {
      setActiveSessionId(crypto.randomUUID())
    }
  }, [activeSessionId, replaceHarness])

  const startSession = useCallback(() => {
    setActiveSessionId(crypto.randomUUID())
    setHarnessMessages([])
  }, [])

  const openSession = useCallback((id: string) => {
    const target = sessions.find((s) => s.id === id)
    if (!target) return
    setActiveSessionId(id)
    replaceHarness(target.messages)
    setPartial('')
  }, [sessions, replaceHarness])

  const deleteSession = useCallback((id: string) => {
    setSessions((old) => old.filter((s) => s.id !== id))
    if (id !== activeSessionId) return
    const remaining = sessions.filter((s) => s.id !== id)
    if (remaining.length) {
      const next = remaining[0]
      setActiveSessionId(next.id)
      replaceHarness(next.messages)
    } else {
      setActiveSessionId(crypto.randomUUID())
      setHarnessMessages([])
    }
  }, [activeSessionId, sessions])
  const cancelSpeech = useCallback(() => {
    speechGeneration.current++
    if (phraseTimer.current) clearTimeout(phraseTimer.current)
    phraseTimer.current = null
    timeline.current.reset()
    speechDecodeChain.current = Promise.resolve()
    sources.current.forEach((x) => { try { x.stop() } catch { /* already stopped */ } })
    speechRequests.current.forEach((x) => x.abort())
    sources.current = []; speechRequests.current = []; playing.current = false; phraseRef.current = ''
  }, [])

  const scheduleAudio = useCallback((audio: AudioBuffer, ctx: AudioContext, generation: number) => {
    if (generation !== speechGeneration.current) return
    const { start, underrun } = timeline.current.next(ctx.currentTime, audio.duration)
    if (underrun) addLog('Audio buffer ran dry; speech generation or decoding is arriving late')
    const source = ctx.createBufferSource(); source.buffer = audio; source.connect(ctx.destination)
    sources.current.push(source)
    playing.current = true
    if (latencyStartRef.current !== null) {
      setLatencyMs(performance.now() - latencyStartRef.current + (start - ctx.currentTime) * 1000)
      setLatencyStart(null); latencyStartRef.current = null; addLog('first TTS audio scheduled')
    }
    setStatus('speaking'); setLevel(.7)
    source.onended = () => {
      source.disconnect()
      sources.current = sources.current.filter(x => x !== source)
      if (generation === speechGeneration.current && !sources.current.length) {
        playing.current = false; setLevel(0)
        setStatus(mutedRef.current ? 'muted' : agentStatus.current)
      }
    }
    source.start(start)
  }, [addLog])

  const queueSpeech = useCallback((text: string) => {
    const cleaned = toSpokenText(text)
    if (!cleaned) return
    const generation = speechGeneration.current
    const controller = new AbortController(); speechRequests.current.push(controller)
    speechDecodeChain.current = speechDecodeChain.current.then(async () => {
        if (generation !== speechGeneration.current || controller.signal.aborted) return
        const started = performance.now()
        let packets = 0, seconds = 0
        const r = await fetch('/api/tts', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: cleaned }) })
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
            if (ctx.state === 'suspended') await ctx.resume()
            const audio = await ctx.decodeAudioData(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength))
            if (generation !== speechGeneration.current) return
            packets++; seconds += audio.duration
            scheduleAudio(audio, ctx, generation)
          }
        }
        if (pending.length) throw new Error('Speech stream ended with an incomplete audio packet')
        if (!packets) throw new Error('Speech generation returned no audio')
        addLog(`TTS: ${cleaned.length} characters, ${seconds.toFixed(1)}s audio, ${packets} packets in ${((performance.now() - started) / 1000).toFixed(1)}s`)
      })
      .catch((e) => { if (generation === speechGeneration.current && e.name !== 'AbortError') setError(e.message) })
      .finally(() => { speechRequests.current = speechRequests.current.filter((x) => x !== controller) })
  }, [scheduleAudio, addLog])

  const flushPhrases = useCallback((final = false, minimum = 150) => {
    const { chunks, remaining } = takeSpeechChunks(phraseRef.current, final, minimum)
    chunks.forEach(queueSpeech)
    phraseRef.current = remaining
    if ((final || chunks.length) && phraseTimer.current) {
      clearTimeout(phraseTimer.current); phraseTimer.current = null
    }
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
    ws.onmessage = async ({ data }) => {
      const event = await parseSocketData(data)
      if (event.type === 'debug') addLog(event.message)
      if (event.type === 'context') setContext({ used: event.used, limit: event.limit })
      if (event.type === 'ready') setStatus('listening')
      if (event.type === 'status') { agentStatus.current = event.value; if (!playing.current || event.value === 'compacting') setStatus(event.value) }
      if (event.type === 'notice') { addLog(event.text); queueSpeech(event.text) }
      if (event.type === 'assistant_segment') { flushPhrases(true); assistantRef.current = ''; setPartial('') }
      if (event.type === 'user') {
        pushHarness({ kind: 'user', text: event.text })
      }
      if (event.type === 'assistant_delta') {
        assistantRef.current += event.text; phraseRef.current += event.text; setPartial(assistantRef.current); flushPhrases()
        if (phraseRef.current && !phraseTimer.current) phraseTimer.current = setTimeout(() => {
          phraseTimer.current = null
          flushPhrases(false, 40)
        }, 1000)
      }
      if (event.type === 'tool_start') pushHarness({ kind: 'tool-call', toolId: event.id, toolName: event.name, summary: event.name })
      if (event.type === 'tool_end') pushHarness({ kind: 'tool-end', toolId: event.id, ok: Boolean(event.ok), summary: event.error || event.name })

      if (event.type === 'assistant_done') {
        flushPhrases(true)
        pushHarness({ kind: 'response', text: event.text })
        assistantRef.current = ''; setPartial('')
      }
      if (event.type === 'browser_active') setBrowserOpen(true)
      if (event.type === 'error') { setError(event.message); setStatus('error') }
      if (event.type === 'reset') { setHarnessMessages([]); setContext(null); setPartial(''); setLiveTranscript(''); sttTranscriptRef.current = '' }
    }
    ws.onerror = () => { setError('Could not reach the local agent server'); setStatus('error') }

    const stt = new WebSocket(`${protocol}://${location.host}/stt`); sttSocketRef.current = stt
    stt.onopen = () => {
      addLog('realtime STT connection opened')
      stt.send(JSON.stringify({ type: 'session.update', session: { audio: { input: { format: { type: 'audio/pcm', rate: 16000 }, turn_detection: null } } } }))
      for (const message of sttPendingRef.current) stt.send(message)
      sttPendingRef.current = []
    }
    stt.onmessage = async ({ data }) => {
      const event = await parseSocketData(data)
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
    return () => { cancelSpeech(); ws.close(); stt.close(); sttSocketRef.current = null }
  }, [flushPhrases, addLog, queueSpeech, cancelSpeech])


  useEffect(() => {
    if (muted) return
    let stopped = false, vad: MicVAD | undefined
    const preRoll: Float32Array[] = []
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
    MicVAD.new({
      model: 'v5', baseAssetPath: '/', onnxWASMBasePath: '/', startOnLoad: true, processorType: 'AudioWorklet',
      positiveSpeechThreshold: 0.65, negativeSpeechThreshold: 0.35, minSpeechMs: 384, redemptionMs: 700,
      getStream: () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }),
      pauseStream: async (stream) => { stream.getTracks().forEach((track) => track.stop()) },
      resumeStream: () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }),
      onFrameProcessed: ({ isSpeech }, frame) => {
        setLevel(isSpeech)
        if (vadActive.current) sendAudio(frame, 16_000)
        else { preRoll.push(frame.slice()); if (preRoll.length > 24) preRoll.shift() }
      },
      onSpeechRealStart: () => {
        if (!allowInterruptions && (playing.current || speechRequests.current.length > 0)) {
          preRoll.length = 0; addLog('Microphone speech ignored while replies are protected'); return
        }
        addLog(playing.current ? 'Confirmed speech interrupted playback' : 'Confirmed microphone speech')
        vadActive.current = true; setStatus('hearing'); cancelSpeech(); socketRef.current?.send(JSON.stringify({ type: 'cancel' })); sendControl('speech_started')
        preRoll.forEach((chunk) => sendAudio(chunk, 16_000)); preRoll.length = 0
      },
      onSpeechEnd: () => {
        if (!vadActive.current) { preRoll.length = 0; return }
        vadActive.current = false; preRoll.length = 0; setStatus('transcribing')
        const started = performance.now(); latencyStartRef.current = started; setLatencyStart(started); setLatencyMs(0); addLog('Silero VAD detected end of speech'); sendControl('commit')
      },
      onVADMisfire: () => { vadActive.current = false; preRoll.length = 0; addLog('Brief microphone noise ignored; playback preserved') },
    }).then((instance) => { if (stopped) void instance.destroy(); else { vad = instance; setStatus('listening') } }).catch((e) => { setError(`Microphone: ${e.message}`); setMuted(true) })
    return () => { stopped = true; vadActive.current = false; if (vad) void vad.destroy() }
  }, [muted, allowInterruptions, cancelSpeech, addLog])


  const submit = (text: string) => { const trimmed = text.trim(); if (!trimmed) return; cancelSpeech(); socketRef.current?.send(JSON.stringify({ type: 'prompt', text: trimmed })) }
  const reset = () => { cancelSpeech(); socketRef.current?.send(JSON.stringify({ type: 'reset' })); sttTranscriptRef.current = ''; setLiveTranscript(''); setHarnessMessages([]); setContext(null); setPartial(''); setStatus('listening'); setLogs([]); setError(''); startSession() }
  const deleteSessionAndReset = (id: string) => {
    deleteSession(id)
    if (id !== activeSessionId) return
    cancelSpeech(); socketRef.current?.send(JSON.stringify({ type: 'reset' })); sttTranscriptRef.current = ''; setLiveTranscript(''); setContext(null); setPartial(''); setStatus('listening'); setError('')
  }
  const statusLabel: Record<Status, string> = { connecting: 'Connecting', listening: 'Listening', hearing: 'I’m listening…', transcribing: 'Transcribing', thinking: 'Thinking', working: 'Working', compacting: 'Summarizing memory', speaking: 'Speaking', muted: 'Microphone muted', error: 'Needs attention' }
  return <main className={`app status-${status} ${browserOpen ? 'with-browser browser-right' : ''}`}>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">J</span><span>Jarvis</span></div>
      <button className="new-session" onClick={reset}><span>＋</span> New conversation</button>
      <div className="history-label">Conversations</div>
      <div className="history-list">
        {sessions.length === 0 && <div className="history-empty">No saved conversations yet</div>}
        {sessions.map((session) => (
          <div className={`history-row ${session.id === activeSessionId ? 'active' : ''}`} key={session.id}>
            <button className="history-item" onClick={() => openSession(session.id)} title={session.title}>
              <span className="pulse-dot"/>
              <span className="history-title">{session.title}</span>
              <small>{session.messages.filter((m) => m.data.kind === 'user').length || ''}</small>
            </button>
            <button className="history-delete" aria-label={`Delete ${session.title}`} title="Delete conversation" onClick={() => deleteSessionAndReset(session.id)}>×</button>
          </div>
        ))}
      </div>
      <div className="sidebar-foot"><div className="local-pill"><span/> Local · Apple silicon</div><button aria-label="Settings" onClick={() => setSettingsOpen(true)}><Icon name="settings"/></button></div>
    </aside>

    <section className="stage">
      <header><div><span className="eyebrow">PRIVATE WORKSPACE</span><h1>Local voice session</h1></div><div className="header-right"><div className="latency" title="Current LLM prompt context"><span>CONTEXT</span><b>{context ? `${(context.used / 1000).toFixed(1)}K / ${Math.round(context.limit / 1024)}K` : '—'}</b></div><div className="latency" title="Time from VAD speech-stop to first voice audio"><span>RESPONSE</span><b>{latencyMs === null ? '—' : `${(latencyMs / 1000).toFixed(2)}s`}</b></div><button className="debug-toggle" onClick={() => setDebugOpen((open) => !open)}>{debugOpen ? 'Hide logs' : 'Logs'}</button><div className="header-actions"><button onClick={reset} title="Reset conversation"><Icon name="reset"/></button><button onClick={() => setSettingsOpen(true)} title="Model settings"><Icon name="settings"/></button></div></div></header>
      {debugOpen && <div className="debug-log">{logs.slice(-20).map((log, index) => <div key={`${log.time}-${index}`}><span>{log.time}</span> {log.message}</div>)}</div>}
      <div className="two-col-workspace">
        <div className="left-column">
          <section className="conversation-area" aria-label="Agent conversation">
            {harnessMessages.length === 0
              ? <HarnessWelcomeScreen workspacePath="~" modelInfo={models?.llmModel || 'ollama'} />
              : <HarnessMessageList messages={harnessMessages} onPermissionDecision={() => {}} />}
          </section>
          <div className="composer">
            <HarnessChatInput
              onSubmit={submit}
              disabled={status === 'connecting' || status === 'error'}
              isThinking={status === 'thinking' || status === 'working' || status === 'compacting'}
              currentProvider="ollama"
              currentModel={models?.llmModel || ''}
              onUpdateRuntimeConfig={async (patch) => ({ provider: patch.provider || 'ollama', model: patch.model || models?.llmModel || '' })}
              onLoadModels={async () => []}
              onExitSession={reset}
            />
          </div>
        </div>

        <aside className="right-column" aria-label="Voice interface">
          <div className="voice-panel">
            <div className="orb-wrap" style={{ '--level': level } as React.CSSProperties}>
              <div className="orbit orbit-a"/><div className="orbit orbit-b"/><div className="orb-glow"/><div className="orb"><div className="orb-core"/></div>
            </div>
            <div className="status-copy">
              <h2>{statusLabel[status]}</h2>
              <p>{liveTranscript || partial || (status === 'listening' ? 'Speak naturally — I’ll detect when you finish.' : status === 'muted' ? 'Unmute to speak, or type below.' : 'Working locally on this Mac.')}</p>
            </div>
            <div className="voice-controls">
              <button className={muted ? 'mic muted' : 'mic'} onClick={() => setMuted((x) => { const next = !x; setStatus(next ? 'muted' : 'listening'); return next })} aria-label={muted ? 'Unmute' : 'Mute'}><Icon name="mic"/></button>
              <button className="end" onClick={() => { cancelSpeech(); socketRef.current?.send(JSON.stringify({ type: 'cancel' })); setStatus('muted'); setMuted(true) }} aria-label="Stop"><Icon name="stop"/></button>
            </div>
          </div>

          <section className="browser-panel" aria-label="Browser workspace" hidden={!browserOpen}>
            <div className="panel-head"><div><Icon name="browser"/><span>Browser workspace</span><i>LIVE</i></div><button onClick={() => setBrowserOpen(false)} title="Hide browser">×</button></div>
            <iframe className="browser-frame" src="/browser-ui/" title="Interactive agent browser" allow="clipboard-read; clipboard-write; fullscreen" />
          </section>
        </aside>
      </div>


      {error && <button className="error-toast" onClick={() => setError('')}>{error}<span>×</span></button>}
    </section>
    {settingsOpen && <div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}><section className="modal" onMouseDown={(e) => e.stopPropagation()}>
      <button className="modal-close" onClick={() => setSettingsOpen(false)}>×</button><span className="eyebrow">RUNTIME</span><h2>Apple silicon stack</h2><p>These adapters use local OpenAI-compatible endpoints. Change them in <code>.env</code>.</p>
      <div className="model-row"><span>Brain</span><div><b>{models?.llmModel || 'Loading…'}</b><small>llama.cpp · Metal</small></div></div>
      <div className="model-row"><span>Ears</span><div><b>{models?.sttModel || 'Loading…'}</b><small>Realtime STT · MLX</small></div></div>
      <div className="model-row"><span>Voice</span><div><b>{models?.ttsModel || 'Loading…'}</b><small>{models?.ttsProvider || 'Loading…'} · {models?.ttsVoice} · MLX</small></div></div>
      <label><input type="checkbox" checked={allowInterruptions} onChange={event => {
        setAllowInterruptions(event.target.checked)
        localStorage.setItem('jarvis.interruptions', String(event.target.checked))
      }}/> Let me interrupt spoken replies</label>
      <p>Turn this off if speaker feedback cuts replies short. The Stop button still works.</p>
      <div className="privacy-note">{models?.profile === 'full' ? 'Full profile detected · 64K LLM context.' : 'Compact profile detected.'} Audio and prompts stay on this Mac when local endpoints are used.</div>
    </section></div>}
  </main>
}

export default App
