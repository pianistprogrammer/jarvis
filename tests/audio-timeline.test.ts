import assert from 'node:assert/strict'
import test from 'node:test'
import { AudioTimeline } from '../src/audio-timeline.js'

test('audio packets share a continuous clock even before earlier playback ends', () => {
  const clock = new AudioTimeline()
  const first = clock.next(10, 0.32)
  const second = clock.next(10.1, 0.32)
  const third = clock.next(10.2, 0.32)
  assert.equal(second.start, first.start + 0.32)
  assert.equal(third.start, second.start + 0.32)
  assert.equal(third.underrun, false)
})

test('late packets rebuffer and cancellation clears the old schedule', () => {
  const clock = new AudioTimeline()
  clock.next(10, 5)
  const late = clock.next(16, 0.32)
  assert.equal(late.underrun, true)
  assert.ok(late.start > 16)
  clock.reset()
  const restarted = clock.next(16.1, 0.32)
  assert.equal(restarted.underrun, false)
  assert.ok(restarted.start < late.start + 0.32)
})
