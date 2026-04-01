function writeStr(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
}

function interleave(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0)
  const l = buffer.getChannelData(0)
  const r = buffer.getChannelData(1)
  const out = new Float32Array(l.length * 2)
  for (let i = 0; i < l.length; i++) {
    out[i * 2] = l[i]
    out[i * 2 + 1] = r[i]
  }
  return out
}

export function encodeWAV(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const samples = interleave(buffer)
  const dataLen = samples.length * 2
  const arrayBuf = new ArrayBuffer(44 + dataLen)
  const view = new DataView(arrayBuf)

  writeStr(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataLen, true)
  writeStr(view, 8, 'WAVE')
  writeStr(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * 2, true)
  view.setUint16(32, numChannels * 2, true)
  view.setUint16(34, 16, true)
  writeStr(view, 36, 'data')
  view.setUint32(40, dataLen, true)

  const int16 = new Int16Array(arrayBuf, 44)
  for (let i = 0; i < samples.length; i++) {
    int16[i] = Math.max(-1, Math.min(1, samples[i])) * 0x7fff
  }

  return new Blob([arrayBuf], { type: 'audio/wav' })
}
