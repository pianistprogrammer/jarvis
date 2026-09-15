import assert from 'node:assert/strict'
import test from 'node:test'
import { toSpokenText } from '../src/spoken.js'
import { toolProgressCue } from '../src/tool-cues.js'

test('spoken text removes emoji and display-only formatting', () => {
  assert.equal(toSpokenText('Great job! 😊 **Done**'), 'Great job! Done')
})

test('browser tools get natural progress cues', () => {
  assert.equal(toolProgressCue('browser_open'), 'I am opening that page and reading it now.')
  assert.equal(toolProgressCue('browser_snapshot'), 'I am reading the page now.')
})
