export function toSpokenText(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, ' I put the technical details on screen. ')
    .replace(/\*+(?:laughs?|giggles?|chuckles?|sighs?)\*+/gi, ' ')
    .replace(/[[(]\s*(?:laughs?|giggles?|chuckles?|sighs?|whispers?|shouts?|sings?)[^\])]*[\])]/gi, ' ')
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
    .replace(/[*_#`]/g, '')
    .replace(/\b(?:AI|API|CPU|GPU|TTS|LLM)\b/g, value => value.split('').join(' '))
    .replace(/(\d)%/g, '$1 percent')
    .replace(/\$(\d+(?:\.\d+)?)/g, '$1 dollars')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Group sentences for cadence without waiting indefinitely for a long response.
// Final short replies remain short; never invent padding to reach a target size.
export function takeSpeechChunks(text: string, final = false, minimum = 150) {
  const chunks: string[] = []
  let remaining = text.trimStart()
  while (remaining.length >= minimum || (final && remaining.length)) {
    const ends = [...remaining.matchAll(/[.!?]["')\]]*(?=\s|$)/g)]
      .map(match => match.index! + match[0].length)
      .filter(end => end <= 250)
    let cut = ends.find(end => end >= minimum)
    if (!cut && remaining.length > 250) {
      cut = ends.at(-1) || remaining.lastIndexOf(' ', 250)
      if (cut <= 0) cut = 250
    }
    if (!cut && final) cut = remaining.length
    if (!cut) break
    let phrase = remaining.slice(0, cut).trim()
    if (!/[.!?]["')\]]*$/.test(phrase)) phrase += '.'
    chunks.push(phrase)
    remaining = remaining.slice(cut).trimStart()
  }
  return { chunks, remaining }
}
