const LOOKAHEAD_MS = 25
const SCHEDULE_AHEAD_S = 0.1

export interface EngineTrack {
  id: string
  buffer: AudioBuffer
  startOffset: number   // seconds from timeline start; negative = starts before t=0
  trimStart: number     // seconds to skip at buffer start
  trimEnd: number       // seconds to skip at buffer end
  volume: number        // 0–1
  pan: number           // -1 to +1
  muted: boolean
}

export class AudioPlusEngine {
  private ctx: AudioContext | null = null
  private sources: Map<string, AudioBufferSourceNode> = new Map()
  private clickTimer: ReturnType<typeof setTimeout> | null = null
  private nextClickTime = 0
  private currentBeat = 0
  private mediaRecorder: MediaRecorder | null = null
  private mediaStream: MediaStream | null = null
  private recordingChunks: Blob[] = []
  private rafId: number | null = null

  getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext()
    return this.ctx
  }

  /** Estimated round-trip output latency in ms from browser APIs (silent). */
  getLatencyMs(): number {
    const ctx = this.getCtx()
    return (ctx.outputLatency + ctx.baseLatency) * 1000
  }

  /**
   * Start playing tracks + optional click. Returns AudioContext time playback begins.
   * onTick is called each animation frame with elapsed seconds since playback started.
   */
  play(
    tracks: EngineTrack[],
    bpm: number,
    metronomeOn: boolean,
    onTick: (elapsedSeconds: number) => void
  ): number {
    const ctx = this.getCtx()
    if (ctx.state === 'suspended') ctx.resume()
    this.stop()

    const masterGain = ctx.createGain()
    masterGain.connect(ctx.destination)

    const startAt = ctx.currentTime + 0.05

    for (const track of tracks) {
      if (track.muted) continue
      const duration = track.buffer.duration - track.trimStart - track.trimEnd
      if (duration <= 0) continue

      const source = ctx.createBufferSource()
      source.buffer = track.buffer

      const gain = ctx.createGain()
      gain.gain.value = track.volume

      const panner = ctx.createStereoPanner()
      panner.pan.value = track.pan

      source.connect(gain)
      gain.connect(panner)
      panner.connect(masterGain)

      // Negative startOffset: track started before t=0, skip into buffer
      const when = startAt + Math.max(0, track.startOffset)
      const bufferOffset = track.trimStart + Math.max(0, -track.startOffset)
      const playDuration = duration - Math.max(0, -track.startOffset)
      if (playDuration <= 0) continue

      source.start(when, bufferOffset, playDuration)
      this.sources.set(track.id, source)
    }

    if (metronomeOn) {
      this.currentBeat = 0
      this.nextClickTime = startAt
      this.scheduleClicks(bpm)
    }

    const tick = () => {
      onTick(ctx.currentTime - startAt)
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)

    return startAt
  }

  stop() {
    this.sources.forEach(s => { try { s.stop() } catch { /* already stopped */ } })
    this.sources.clear()
    if (this.clickTimer !== null) { clearTimeout(this.clickTimer); this.clickTimer = null }
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null }
  }

  destroy() {
    this.stop()
    this.ctx?.close()
    this.ctx = null
  }

  private scheduleClicks(bpm: number) {
    if (!this.ctx) return
    const ctx = this.getCtx()
    while (this.nextClickTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
      this.playClick(this.nextClickTime, this.currentBeat % 4 === 0)
      this.nextClickTime += 60 / bpm
      this.currentBeat++
    }
    this.clickTimer = setTimeout(() => this.scheduleClicks(bpm), LOOKAHEAD_MS)
  }

  private playClick(time: number, isDownbeat: boolean) {
    const ctx = this.getCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = isDownbeat ? 1000 : 800
    gain.gain.setValueAtTime(0.001, time)
    gain.gain.exponentialRampToValueAtTime(0.4, time + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06)
    osc.start(time)
    osc.stop(time + 0.07)
    osc.onended = () => {
      osc.disconnect()
      gain.disconnect()
    }
  }

  /**
   * Start recording from mic while playing tracks.
   * Use headphones to avoid feedback.
   */
  async startRecording(
    tracks: EngineTrack[],
    bpm: number,
    metronomeOn: boolean,
    onTick: (elapsedSeconds: number) => void
  ): Promise<{ stream: MediaStream; startAt: number }> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.mediaStream = stream
    const startAt = this.play(tracks, bpm, metronomeOn, onTick)

    this.recordingChunks = []
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
    this.mediaRecorder = new MediaRecorder(stream, { mimeType })
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recordingChunks.push(e.data)
    }
    this.mediaRecorder.start()

    return { stream, startAt }
  }

  /**
   * Stop recording. Returns raw audio bytes and the latency-corrected startOffset.
   * startOffset is negative: shifts track backward to compensate for round-trip latency.
   */
  stopRecording(latencyOffsetMs: number): Promise<{ audioData: ArrayBuffer; startOffset: number }> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) { reject(new Error('no active recorder')); return }
      const recorder = this.mediaRecorder
      recorder.onstop = async () => {
        const blob = new Blob(this.recordingChunks, { type: recorder.mimeType })
        const audioData = await blob.arrayBuffer()
        resolve({ audioData, startOffset: -(latencyOffsetMs / 1000) })
      }
      recorder.stop()
      this.stop()
      this.mediaStream?.getTracks().forEach(t => t.stop())
      this.mediaStream = null
    })
  }
}
