const quietFillers = /^(?:mm+[- ]?hm+|uh+[- ]?huh+|mhm|hmm+|uhm+)[.!?,]*$/i

function words(text) {
  return text.trim().split(/\s+/).filter(Boolean)
}

function mergeFragments(fragments) {
  const merged = []
  for (const fragment of fragments) {
    const incoming = words(fragment)
    let overlap = 0
    for (let size = Math.min(5, merged.length, incoming.length); size > 0; size -= 1) {
      const left = merged.slice(-size).map((word) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''))
      const right = incoming.slice(0, size).map((word) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''))
      if (left.every((word, index) => word && word === right[index])) {
        overlap = size
        break
      }
    }
    merged.push(...incoming.slice(overlap))
  }
  return merged.join(' ')
}

export function isSubstantiveSpeech(transcript) {
  const text = String(transcript || '').trim()
  return Boolean(text) && !quietFillers.test(text) && !/^\[(?:NO_VOICE|SILENCE)\]$/i.test(text)
}

export function createSpeechContext(resetAfterQuietWindows = 2) {
  let fragments = []
  let quietWindows = 0
  let generation = 0

  return {
    observe(transcript) {
      const text = String(transcript || '').trim()
      if (isSubstantiveSpeech(text)) {
        fragments.push(text)
        quietWindows = 0
        generation += 1
      } else if (fragments.length) {
        quietWindows += 1
        if (quietWindows >= resetAfterQuietWindows) {
          fragments = []
          quietWindows = 0
        }
      }
      const context = mergeFragments(fragments)
      return { generation, wordCount: words(context).length }
    },
    get generation() { return generation },
  }
}

export function selectSpokenAction(completion, utteranceWordCount = 0) {
  const match = String(completion || '').trim().match(/^<(backchannel|respond)>\s*(.*)$/is)
  if (!match) return null
  const action = match[1].toLowerCase()
  if (action === 'backchannel' && Number(utteranceWordCount) < 5) return null
  const text = words(match[2]).slice(0, action === 'backchannel' ? 2 : 3).join(' ')
  return text ? { action, text } : null
}
