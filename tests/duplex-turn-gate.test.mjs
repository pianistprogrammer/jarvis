import test from 'node:test'
import assert from 'node:assert/strict'
import { createSpeechContext, isSubstantiveSpeech, selectSpokenAction } from '../public/duplex-turn-gate.js'

test('tracks speech continuously and resets utterance context after two silent windows', () => {
  const speech = createSpeechContext()
  assert.deepEqual(speech.observe('I was talking about my trip'), { generation: 1, wordCount: 6 })
  assert.deepEqual(speech.observe('and then we got lost'), { generation: 2, wordCount: 11 })
  assert.deepEqual(speech.observe(''), { generation: 2, wordCount: 11 })
  assert.deepEqual(speech.observe(''), { generation: 2, wordCount: 0 })
})

test('does not reset context on silence hallucinations and removes overlapping words', () => {
  const speech = createSpeechContext()
  speech.observe('We went to the store')
  assert.deepEqual(speech.observe('to the store and bought milk'), { generation: 2, wordCount: 8 })
  assert.deepEqual(speech.observe('Mm-hmm.'), { generation: 2, wordCount: 8 })
})

test('identifies common silence hallucinations as non-speech', () => {
  assert.equal(isSubstantiveSpeech('Mm-hmm.'), false)
  assert.equal(isSubstantiveSpeech('[NO_VOICE]'), false)
  assert.equal(isSubstantiveSpeech('Yeah.'), true)
})

test('keeps backchannels brief but preserves the full response text', () => {
  assert.equal(selectSpokenAction('<backchannel>mm-hm', 2), null)
  assert.deepEqual(selectSpokenAction('<backchannel>mm-hm okay', 7), {
    action: 'backchannel', text: 'mm-hm okay',
  })
  assert.deepEqual(selectSpokenAction('<respond>Okay, I can do that now', 2), {
    action: 'respond', text: 'Okay, I can do that now',
  })
  assert.equal(selectSpokenAction('<listen>', 8), null)
})
