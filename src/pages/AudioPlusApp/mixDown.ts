interface MixTrack {
  buffer: AudioBuffer
  startOffset: number
  trimStart: number
  trimEnd: number
  volume: number
  pan: number   // -1 to +1
  muted: boolean
}

/**
 * Render all non-muted tracks into a single stereo AudioBuffer at the given sampleRate.
 * Uses equal-power panning.
 */
export function mixDown(tracks: MixTrack[], sampleRate: number): AudioBuffer {
  let totalDuration = 0
  for (const t of tracks) {
    if (t.muted) continue
    const duration = t.buffer.duration - t.trimStart - t.trimEnd
    const bufferSkip = Math.max(0, -t.startOffset)
    const effectiveDuration = Math.max(0, duration - bufferSkip)
    const end = Math.max(0, t.startOffset) + effectiveDuration
    if (end > totalDuration) totalDuration = end
  }

  const totalSamples = Math.max(1, Math.ceil(totalDuration * sampleRate))
  const out = new AudioBuffer({ numberOfChannels: 2, length: totalSamples, sampleRate })
  const outL = out.getChannelData(0)
  const outR = out.getChannelData(1)

  for (const t of tracks) {
    if (t.muted) continue
    const srcL = t.buffer.getChannelData(0)
    const srcR = t.buffer.numberOfChannels > 1 ? t.buffer.getChannelData(1) : srcL

    // Equal-power pan: angle 0 (hard left) → π/2 (hard right)
    const angle = ((t.pan + 1) / 2) * (Math.PI / 2)
    const gainL = Math.cos(angle) * t.volume
    const gainR = Math.sin(angle) * t.volume

    const destStart = Math.max(0, Math.round(t.startOffset * sampleRate))
    const srcStart = Math.round(t.trimStart * sampleRate) +
      Math.round(Math.max(0, -t.startOffset) * sampleRate)
    const srcEnd = t.buffer.length - Math.round(t.trimEnd * sampleRate)
    const copyLength = Math.min(srcEnd - srcStart, totalSamples - destStart)

    for (let i = 0; i < copyLength; i++) {
      const s = srcStart + i
      if (s >= srcL.length) break
      outL[destStart + i] += srcL[s] * gainL
      outR[destStart + i] += srcR[s] * gainR
    }
  }

  return out
}
