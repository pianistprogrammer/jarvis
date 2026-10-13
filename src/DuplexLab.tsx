/// Minimal developer-facing Duplex Lab
/// Continuous 600ms capture with no VAD; feeds adapter endpoint.
import { useEffect, useRef, useState, useCallback } from 'react'

function DuplexLab() {
  const [running, setRunning] = useState(false)
  const [ticks, setTicks] = useState<{ tick: number; heard: string; decision: string; timeMs: string; responsiveMs?: number; targetMs?: number }[]>([])
  const [windowId, setWindowId] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const historyRef = useRef<string[]>([])

  const start = useCallback(() => {
    if (running) return
    setRunning(true)
    setTicks([])
    setWindowId(0)
    historyRef.current = []
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    audioRef.current = ctx
    navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } }).then((stream) => {
      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      const buffers: Int16Array[] = []
      let lastWindowMs = 0

      processor.onaudioprocess = (e) => {
        if (!running) return
        const input = e.inputBuffer.getChannelData(0)
        const int16 = new Int16Array(input.length)
        for (let i = 0; i < input.length; i++) int16[i] = Math.max(-1, Math.min(1, input[i])) * 0x7fff
        buffers.push(new Int16Array(int16))
      }

      timerRef.current = setInterval(async () => {
        if (!running) return
        if (buffers.length === 0) return
        const chunkSamples = 0.6 * 16000 // 9600 samples = 600ms
        const needed = Math.floor(chunkSamples / buffers.reduce((sum, b) => sum + b.length, 0))
        const combined = new Int16Array(Math.min(chunkSamples, buffers.reduce((sum, b) => sum + b.length, 0)))
        let pos = 0
        for (const buf of buffers) {
          for (let i = 0; i < buf.length && pos < combined.length; i++) combined[pos++] = buf[i]
        }
        buffers.length = 0
        const bin = new Uint8Array(combined.buffer, combined.byteOffset, combined.byteLength)
        const blob = new Blob([new Uint8Array(bin.buffer, 0, bin.byteLength)], { type: 'audio/wav' })
        const form = new FormData()
        form.append('audio', new File([blob], 'tick.wav', { type: 'audio/wav' }))
        try {
          const t0 = performance.now()
          const r = await fetch('http://127.0.0.1:8091/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'mlx-community/Qwen3.5-9B-MLX-4bit',
              messages: [
                ...historyRef.current.slice(-40).map((m) => {
                  const [role, ...contentWords] = m.split(':')
                  return { role: role.trim() === 'user' ? 'user' : 'assistant', content: contentWords.join(':').trim() || (m.trim().startsWith('assistant') ? '<listen>' : '') }
                }),
                { role: 'user', content: `user: ...` },
              ],
              max_tokens: 5,
              temperature: 0,
            }),
            signal: AbortSignal.timeout(10_000),
          })
          const body = await r.json() as { choices?: { message?: { content?: string } }[] }
          const decisionRaw = body?.choices?.[0]?.message?.content?.trim() || ''
          const decision = decisionRaw === '' ? '<listen>' : decisionRaw
          const responsiveMs = decision === '<listen>' ? undefined : Math.max(0, Math.round(performance.now() - t0))
          setTicks((old) => [
            ...old.slice(-499),
            { tick: windowId, heard: `... (chunk)`, decision, timeMs: new Date().toLocaleTimeString(), responsiveMs, targetMs: 600 },
          ])
          setWindowId((w) => w + 1)
          if (decision !== '<listen>') historyRef.current.push(`assistant: ${decision}`)
          else historyRef.current.push('user: ...')
        } catch (e) {
          console.error('Lab tick failed', e)
        }
      }, 600)
    }).catch((err) => console.error('Mic access:', err))
  }, [running, windowId])

  const stop = useCallback(() => {
    if (!running) return
    setRunning(false)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }, [running])

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', background: '#faf8f0', minHeight: '100vh' }}>
      <h1>Duplex Lab (VAD-free 600ms)</h1>
      <p>MLX adapter endpoint: <code>http://127.0.0.1:8091</code> | Model: Qwen3.5-9B-MLX-4bit + LoRA adapter</p>
      <div style={{ marginBottom: 12 }}>
        <button onClick={start} disabled={running}>Start 600ms stream</button>
        <button onClick={stop} disabled={!running} style={{ marginLeft: 8 }}>Stop</button>
      </div>
      <div style={{ marginBottom: 12 }}>
        <span>Ticks: {ticks.length}. Latest decision: <strong>{ticks[ticks.length - 1]?.decision || 'none yet'}</strong></span>
      </div>
      <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
        <thead><tr style={{ background: '#aa3bff', color: '#fff' }}><th>Tick</th><th>Heard (short)</th><th>Decision</th><th>Responsive (ms)</th><th>Target (ms)</th></tr></thead>
        <tbody>
          {ticks.map((t) => (
            <tr key={t.tick + t.timeMs} style={{ borderBottom: '1px solid #ddd', background: t.responsiveMs && t.responsiveMs <= 600 ? '#d1fae5' : t.responsiveMs ? '#fee2e2' : '#fff7ed' }}>
              <td style={{ padding: 4 }}>{t.tick}</td>
              <td style={{ padding: 4 }}>{t.heard.slice(0, 80)}</td>
              <td style={{ padding: 4, fontWeight: 600 }}>{t.decision}</td>
              <td style={{ padding: 4 }}>{t.responsiveMs !== undefined ? t.responsiveMs + ' ms' : '-'}</td>
              <td style={{ padding: 4 }}>{t.targetMs + ' ms'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default DuplexLab
