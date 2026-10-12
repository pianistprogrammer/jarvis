// Schedule packets on the audio clock, not in main-thread onended callbacks.
export class AudioTimeline {
  private end = 0
  next(now: number, duration: number) {
    const underrun = this.end > 0 && now > this.end
    const start = this.end > now ? this.end : now + 0.16
    this.end = start + duration
    return { start, underrun }
  }
  reset() { this.end = 0 }
}
