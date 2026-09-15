export function frameAudioChunk(chunk: Uint8Array) {
  const frame = Buffer.allocUnsafe(4 + chunk.length)
  frame.writeUInt32LE(chunk.length, 0)
  Buffer.from(chunk).copy(frame, 4)
  return frame
}
