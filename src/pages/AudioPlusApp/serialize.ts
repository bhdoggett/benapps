import { encodeWAV } from '../../utils/audio/wavEncoder'

interface SerializedTrack {
  id: string
  name: string
  audioDataB64: string
  startOffset: number
  trimStart: number
  trimEnd: number
  volume: number
  pan: number
  muted: boolean
}

interface ProjectFile {
  version: 1
  projectName: string
  bpm: number
  latencyOffsetMs: number
  tracks: SerializedTrack[]
}

interface SaveTrack {
  id: string
  name: string
  audioData: ArrayBuffer
  buffer: AudioBuffer
  startOffset: number
  trimStart: number
  trimEnd: number
  volume: number
  pan: number
  muted: boolean
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

export async function saveProject(opts: {
  projectName: string
  bpm: number
  latencyOffsetMs: number
  tracks: SaveTrack[]
  mode: 'full' | 'compact'
}): Promise<void> {
  const serializedTracks: SerializedTrack[] = await Promise.all(
    opts.tracks.map(async (t) => {
      let bytes: ArrayBuffer
      if (opts.mode === 'compact') {
        const blob = encodeWAV(t.buffer)
        bytes = await blob.arrayBuffer()
      } else {
        bytes = t.audioData
      }
      return {
        id: t.id,
        name: t.name,
        audioDataB64: arrayBufferToBase64(bytes),
        startOffset: t.startOffset,
        trimStart: t.trimStart,
        trimEnd: t.trimEnd,
        volume: t.volume,
        pan: t.pan,
        muted: t.muted,
      }
    })
  )

  const project: ProjectFile = {
    version: 1,
    projectName: opts.projectName,
    bpm: opts.bpm,
    latencyOffsetMs: opts.latencyOffsetMs,
    tracks: serializedTracks,
  }

  const blob = new Blob([JSON.stringify(project)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${opts.projectName}.audioplus`
  a.click()
  URL.revokeObjectURL(url)
}

export async function loadProject(
  file: File,
  ctx: AudioContext
): Promise<{
  projectName: string
  bpm: number
  latencyOffsetMs: number
  tracks: Array<{
    id: string
    name: string
    audioData: ArrayBuffer
    startOffset: number
    trimStart: number
    trimEnd: number
    volume: number
    pan: number
    muted: boolean
  }>
  buffers: Map<string, AudioBuffer>
}> {
  const text = await file.text()
  const project: ProjectFile = JSON.parse(text)
  if (project.version !== 1) throw new Error('Unsupported project version')

  const buffers = new Map<string, AudioBuffer>()
  const tracks = await Promise.all(
    project.tracks.map(async (t) => {
      const audioData = base64ToArrayBuffer(t.audioDataB64)
      // slice(0) copies the buffer so decodeAudioData can detach it
      const buffer = await ctx.decodeAudioData(audioData.slice(0))
      buffers.set(t.id, buffer)
      return {
        id: t.id,
        name: t.name,
        audioData,
        startOffset: t.startOffset,
        trimStart: t.trimStart,
        trimEnd: t.trimEnd,
        volume: t.volume,
        pan: t.pan,
        muted: t.muted,
      }
    })
  )

  return { projectName: project.projectName, bpm: project.bpm, latencyOffsetMs: project.latencyOffsetMs, tracks, buffers }
}
