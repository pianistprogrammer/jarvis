import assert from 'node:assert/strict'
import test from 'node:test'
import { toSpokenText, takeSpeechChunks } from '../src/spoken.js'
import { toolProgressCue } from '../src/tool-cues.js'

test('spoken text removes emoji and display-only formatting', () => {
  assert.equal(toSpokenText('Great job! 😊 **Done**'), 'Great job! Done')
})

test('spoken text removes common expressive stage directions', () => {
  assert.equal(toSpokenText('The answer is ready [laughs] now.'), 'The answer is ready now.')
})

test('browser tools get natural progress cues', () => {
  assert.equal(toolProgressCue('browser_open'), 'Let’s open that page.')
  assert.equal(toolProgressCue('browser_snapshot'), 'Let me take a look.')
})

test('speech groups short sentences and consumes the final fragment exactly once', () => {
  const text = 'Ready. I have checked the results.'
  assert.deepEqual(takeSpeechChunks(text), { chunks: [], remaining: text })
  const flushed = takeSpeechChunks(text, true)
  assert.deepEqual(flushed, { chunks: [text], remaining: '' })
  assert.deepEqual(takeSpeechChunks(flushed.remaining, true).chunks, [])
})

test('long speech is bounded, punctuated, and preserves all words', () => {
  const text = 'word '.repeat(210).trim()
  const { chunks, remaining } = takeSpeechChunks(text, true)
  assert.equal(remaining, '')
  assert.ok(chunks.every(chunk => chunk.length <= 251 && chunk.endsWith('.')))
  assert.equal(chunks.join(' ').replaceAll('.', ''), text)
})

test('speech normalization spells known initialisms and removes stage laughter', () => {
  assert.equal(toSpokenText('AI costs $45, down 10%. *laughs*'), 'A I costs 45 dollars, down 10 percent.')
})

test('latency flush releases a complete sentence without cutting an unfinished thought', () => {
  const complete = 'I found the page and will check the details.'
  const pending = ' The next thing I need to'
  assert.deepEqual(takeSpeechChunks(complete + pending, false, 40), {
    chunks: [complete], remaining: pending.trimStart(),
  })
  assert.deepEqual(takeSpeechChunks(pending, false, 40).chunks, [])
})
