# AudioPlus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multitrack audio recorder/mixer at `/audioplus` with import, overdub recording, BPM grid, per-track controls, mix-down export, and project save/load.

**Architecture:** DOM-based timeline with sticky sidebars; each track is a row with a `position:sticky` left sidebar and an absolutely-positioned waveform canvas. Audio handled entirely via Web Audio API + MediaRecorder. Utility files (engine, mixDown, serialize, useWaveform) live alongside index.tsx; shared encoders move to `src/utils/audio/`.

**Tech Stack:** React 18, TypeScript, Web Audio API, MediaRecorder API, lamejs (MP3), CSS Modules.

> **Note on testing:** This project has no test infrastructure and all logic depends on browser APIs (AudioContext, MediaRecorder, Canvas). Tasks use manual verification instead of unit tests.

---

### Task 1: Move shared audio encoders

**Files:**
- Move: `src/pages/AudioApp/wavEncoder.ts` → `src/utils/audio/wavEncoder.ts`
- Move: `src/pages/AudioApp/mp3Encoder.ts` → `src/utils/audio/mp3Encoder.ts`
- Modify: `src/pages/AudioApp/index.tsx` (lines importing encoders)

- [ ] **Step 1: Create utils directory and copy encoder files**

```bash
mkdir -p src/utils/audio
cp src/pages/AudioApp/wavEncoder.ts src/utils/audio/wavEncoder.ts
cp src/pages/AudioApp/mp3Encoder.ts src/utils/audio/mp3Encoder.ts
```

- [ ] **Step 2: Update AudioApp imports**

In `src/pages/AudioApp/index.tsx`, change:
```ts
import { encodeWAV } from './wavEncoder'
import { encodeMP3 } from './mp3Encoder'
```
to:
```ts
import { encodeWAV } from '../../utils/audio/wavEncoder'
import { encodeMP3 } from '../../utils/audio/mp3Encoder'
```

- [ ] **Step 3: Delete old encoder files from AudioApp**

```bash
rm src/pages/AudioApp/wavEncoder.ts
rm src/pages/AudioApp/mp3Encoder.ts
```

- [ ] **Step 4: Verify AudioApp still builds**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/utils/audio/wavEncoder.ts src/utils/audio/mp3Encoder.ts src/pages/AudioApp/index.tsx
git add -u src/pages/AudioApp/wavEncoder.ts src/pages/AudioApp/mp3Encoder.ts
git commit -m "Move shared audio encoders to src/utils/audio/"
```

---

### Task 2: Scaffold route, landing entry, empty component

**Files:**
- Create: `src/pages/AudioPlusApp/index.tsx`
- Create: `src/pages/AudioPlusApp/AudioPlusApp.module.css`
- Modify: `src/App.tsx`
- Modify: `src/pages/Landing/index.tsx`

- [ ] **Step 1: Create empty component**

Create `src/pages/AudioPlusApp/index.tsx`:
```tsx
import AppHeader from '../../components/AppHeader'
import styles from './AudioPlusApp.module.css'

export default function AudioPlusApp() {
  return (
    <div className={styles.app}>
      <AppHeader title="audio+" about={<p>Multitrack audio recorder.</p>} />
    </div>
  )
}
```

Create `src/pages/AudioPlusApp/AudioPlusApp.module.css`:
```css
.app {
  max-width: 100%;
  margin: 0 auto;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 2: Add route to App.tsx**

In `src/App.tsx`, add import after the existing audio imports:
```tsx
import AudioPlusApp from './pages/AudioPlusApp'
```

In the `children` array, add after `/audio`:
```tsx
{ path: '/audioplus', element: <AudioPlusApp /> },
```

- [ ] **Step 3: Add to Landing**

In `src/pages/Landing/index.tsx`, in the `apps` array under `// media`, add after `/audio`:
```ts
{ path: '/audioplus', name: 'audio+' },
```

- [ ] **Step 4: Verify**

Run: `npm run dev`, visit `/audioplus` — should show header with "audio+".

- [ ] **Step 5: Commit**

```bash
git add src/pages/AudioPlusApp/ src/App.tsx src/pages/Landing/index.tsx
git commit -m "Scaffold AudioPlusApp route and landing entry"
```

---

### Task 3: Audio engine module

**Files:**
- Create: `src/pages/AudioPlusApp/engine.ts`

- [ ] **Step 1: Create engine.ts**

Create `src/pages/AudioPlusApp/engine.ts` with full contents:

```typescript
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

  private scheduleClicks(bpm: number) {
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
    })
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build` — expect no errors in engine.ts.

---

### Task 4: Mix-down utility

**Files:**
- Create: `src/pages/AudioPlusApp/mixDown.ts`

- [ ] **Step 1: Create mixDown.ts**

```typescript
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
```

---

### Task 5: Serialize utility

**Files:**
- Create: `src/pages/AudioPlusApp/serialize.ts`

- [ ] **Step 1: Create serialize.ts**

```typescript
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
```

---

### Task 6: Waveform hook

**Files:**
- Create: `src/pages/AudioPlusApp/useWaveform.ts`

- [ ] **Step 1: Create useWaveform.ts**

```typescript
import { useEffect } from 'react'

/**
 * Draws a peak waveform onto a canvas element.
 * Resizes the canvas to match (duration * pxPerSec) × height.
 */
export function useWaveform(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  buffer: AudioBuffer | null,
  trimStart: number,
  trimEnd: number,
  pxPerSec: number,
  height: number
): void {
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !buffer) return

    const sr = buffer.sampleRate
    const startSample = Math.round(trimStart * sr)
    const endSample = Math.max(startSample + 1, buffer.length - Math.round(trimEnd * sr))
    const duration = (endSample - startSample) / sr
    const width = Math.max(1, Math.round(duration * pxPerSec))

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx2d = canvas.getContext('2d')!
    ctx2d.scale(dpr, dpr)

    const color = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim()
    const data = buffer.getChannelData(0)
    const samplesPerPx = (endSample - startSample) / width

    ctx2d.clearRect(0, 0, width, height)
    ctx2d.fillStyle = color

    const mid = height / 2
    for (let x = 0; x < width; x++) {
      const s0 = Math.round(startSample + x * samplesPerPx)
      const s1 = Math.min(data.length, Math.round(startSample + (x + 1) * samplesPerPx))
      let peak = 0
      for (let s = s0; s < s1; s++) {
        const abs = Math.abs(data[s])
        if (abs > peak) peak = abs
      }
      const h = Math.max(1, peak * mid)
      ctx2d.fillRect(x, mid - h, 1, h * 2)
    }
  }, [canvasRef, buffer, trimStart, trimEnd, pxPerSec, height])
}
```

- [ ] **Step 2: Commit utility files**

```bash
git add src/pages/AudioPlusApp/engine.ts src/pages/AudioPlusApp/mixDown.ts \
        src/pages/AudioPlusApp/serialize.ts src/pages/AudioPlusApp/useWaveform.ts
git commit -m "Add AudioPlus utility modules: engine, mixDown, serialize, useWaveform"
```

---

### Task 7: State model and reducer

**Files:**
- Modify: `src/pages/AudioPlusApp/index.tsx`

- [ ] **Step 1: Replace index.tsx with full state model**

Replace `src/pages/AudioPlusApp/index.tsx` with:

```tsx
import { useReducer, useRef, useEffect } from 'react'
import AppHeader from '../../components/AppHeader'
import { useIsLandscapeMobile } from '../../hooks/useIsLandscapeMobile'
import { AudioPlusEngine } from './engine'
import type { EngineTrack } from './engine'
import { mixDown } from './mixDown'
import { saveProject, loadProject } from './serialize'
import { useWaveform } from './useWaveform'
import { encodeWAV } from '../../utils/audio/wavEncoder'
import { encodeMP3 } from '../../utils/audio/mp3Encoder'
import styles from './AudioPlusApp.module.css'

const SIDEBAR_WIDTH = 180
const TRACK_ROW_HEIGHT = 72

// ── Types ────────────────────────────────────────────────────────────────────

type Track = {
  id: string
  name: string
  audioData: ArrayBuffer
  startOffset: number   // seconds from timeline start; negative allowed
  trimStart: number     // seconds to skip at buffer start
  trimEnd: number       // seconds to skip at buffer end
  volume: number        // 0–1
  pan: number           // -1 to +1
  muted: boolean
}

type State = {
  phase: 'idle' | 'recording'
  projectName: string
  bpm: number
  metronomeOn: boolean
  isPlaying: boolean
  playheadTime: number
  tracks: Track[]
  latencyOffsetMs: number
  pxPerSec: number
}

type Action =
  | { type: 'ADD_TRACK'; track: Track }
  | { type: 'REMOVE_TRACK'; id: string }
  | { type: 'RENAME_TRACK'; id: string; name: string }
  | { type: 'SET_VOLUME'; id: string; volume: number }
  | { type: 'SET_PAN'; id: string; pan: number }
  | { type: 'TOGGLE_MUTE'; id: string }
  | { type: 'SET_OFFSET'; id: string; startOffset: number }
  | { type: 'SET_TRIM'; id: string; trimStart: number; trimEnd: number }
  | { type: 'SET_BPM'; bpm: number }
  | { type: 'TOGGLE_METRONOME' }
  | { type: 'SET_PLAYING'; isPlaying: boolean }
  | { type: 'SET_PLAYHEAD'; time: number }
  | { type: 'SET_PHASE'; phase: State['phase'] }
  | { type: 'SET_PROJECT_NAME'; name: string }
  | { type: 'SET_LATENCY'; ms: number }
  | { type: 'SET_PX_PER_SEC'; pxPerSec: number }
  | { type: 'LOAD_PROJECT'; projectName: string; bpm: number; latencyOffsetMs: number; tracks: Track[] }

const initial: State = {
  phase: 'idle',
  projectName: 'untitled',
  bpm: 120,
  metronomeOn: false,
  isPlaying: false,
  playheadTime: 0,
  tracks: [],
  latencyOffsetMs: 0,
  pxPerSec: 100,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD_TRACK':
      return { ...state, tracks: [...state.tracks, action.track] }
    case 'REMOVE_TRACK':
      return { ...state, tracks: state.tracks.filter(t => t.id !== action.id) }
    case 'RENAME_TRACK':
      return { ...state, tracks: state.tracks.map(t => t.id === action.id ? { ...t, name: action.name } : t) }
    case 'SET_VOLUME':
      return { ...state, tracks: state.tracks.map(t => t.id === action.id ? { ...t, volume: action.volume } : t) }
    case 'SET_PAN':
      return { ...state, tracks: state.tracks.map(t => t.id === action.id ? { ...t, pan: action.pan } : t) }
    case 'TOGGLE_MUTE':
      return { ...state, tracks: state.tracks.map(t => t.id === action.id ? { ...t, muted: !t.muted } : t) }
    case 'SET_OFFSET':
      return { ...state, tracks: state.tracks.map(t => t.id === action.id ? { ...t, startOffset: action.startOffset } : t) }
    case 'SET_TRIM':
      return { ...state, tracks: state.tracks.map(t => t.id === action.id ? { ...t, trimStart: action.trimStart, trimEnd: action.trimEnd } : t) }
    case 'SET_BPM':
      return { ...state, bpm: Math.max(20, Math.min(300, action.bpm)) }
    case 'TOGGLE_METRONOME':
      return { ...state, metronomeOn: !state.metronomeOn }
    case 'SET_PLAYING':
      return { ...state, isPlaying: action.isPlaying }
    case 'SET_PLAYHEAD':
      return { ...state, playheadTime: action.time }
    case 'SET_PHASE':
      return { ...state, phase: action.phase }
    case 'SET_PROJECT_NAME':
      return { ...state, projectName: action.name }
    case 'SET_LATENCY':
      return { ...state, latencyOffsetMs: action.ms }
    case 'SET_PX_PER_SEC':
      return { ...state, pxPerSec: action.pxPerSec }
    case 'LOAD_PROJECT':
      return {
        ...state,
        phase: 'idle',
        isPlaying: false,
        playheadTime: 0,
        projectName: action.projectName,
        bpm: action.bpm,
        latencyOffsetMs: action.latencyOffsetMs,
        tracks: action.tracks,
      }
    default:
      return state
  }
}

// Placeholder — full component added in Tasks 8–9
export default function AudioPlusApp() {
  const [state, dispatch] = useReducer(reducer, initial)
  const isLandscapeMobile = useIsLandscapeMobile()
  void state; void dispatch; void isLandscapeMobile
  return <div>state model ready</div>
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build` — expect no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/AudioPlusApp/index.tsx
git commit -m "Add AudioPlus state model and reducer"
```

---

### Task 8: TrackRow component

**Files:**
- Modify: `src/pages/AudioPlusApp/index.tsx` (add TrackRow above the default export)

- [ ] **Step 1: Add TrackRow to index.tsx**

Insert this block immediately before `export default function AudioPlusApp()`:

```tsx
// ── TrackRow ─────────────────────────────────────────────────────────────────

type TrackRowProps = {
  track: Track
  buffer: AudioBuffer | null
  pxPerSec: number
  dispatch: React.Dispatch<Action>
}

function TrackRow({ track, buffer, pxPerSec, dispatch }: TrackRowProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useWaveform(canvasRef, buffer, track.trimStart, track.trimEnd, pxPerSec, TRACK_ROW_HEIGHT - 16)

  const duration = buffer ? buffer.duration - track.trimStart - track.trimEnd : 0
  const canvasWidth = Math.max(1, Math.round(duration * pxPerSec))
  const leftPos = Math.max(0, track.startOffset) * pxPerSec

  function handleDragPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const origOffset = track.startOffset
    function onMove(ev: PointerEvent) {
      dispatch({ type: 'SET_OFFSET', id: track.id, startOffset: origOffset + (ev.clientX - startX) / pxPerSec })
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  function handleTrimLeft(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const origTrimStart = track.trimStart
    function onMove(ev: PointerEvent) {
      const newTrimStart = Math.max(0, Math.min(
        origTrimStart + (ev.clientX - startX) / pxPerSec,
        (buffer?.duration ?? 0) - track.trimEnd - 0.1
      ))
      dispatch({ type: 'SET_TRIM', id: track.id, trimStart: newTrimStart, trimEnd: track.trimEnd })
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  function handleTrimRight(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const origTrimEnd = track.trimEnd
    function onMove(ev: PointerEvent) {
      const newTrimEnd = Math.max(0, Math.min(
        origTrimEnd - (ev.clientX - startX) / pxPerSec,
        (buffer?.duration ?? 0) - track.trimStart - 0.1
      ))
      dispatch({ type: 'SET_TRIM', id: track.id, trimStart: track.trimStart, trimEnd: newTrimEnd })
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  return (
    <div className={styles.trackRow}>
      <div className={styles.sidebar}>
        <input
          className={styles.trackName}
          value={track.name}
          onChange={e => dispatch({ type: 'RENAME_TRACK', id: track.id, name: e.target.value })}
        />
        <div className={styles.sidebarControls}>
          <span className={styles.faderLabel}>vol</span>
          <input type="range" className={styles.fader} min={0} max={1} step={0.01}
            value={track.volume}
            onChange={e => dispatch({ type: 'SET_VOLUME', id: track.id, volume: Number(e.target.value) })} />
          <span className={styles.faderLabel}>pan</span>
          <input type="range" className={styles.fader} min={-1} max={1} step={0.01}
            value={track.pan}
            onChange={e => dispatch({ type: 'SET_PAN', id: track.id, pan: Number(e.target.value) })} />
        </div>
        <div className={styles.sidebarActions}>
          <button
            className={[styles.muteBtn, track.muted ? styles.muteBtnOn : ''].join(' ')}
            onClick={() => dispatch({ type: 'TOGGLE_MUTE', id: track.id })}
          >M</button>
          <button className={styles.deleteBtn}
            onClick={() => dispatch({ type: 'REMOVE_TRACK', id: track.id })}>×</button>
        </div>
      </div>
      <div className={styles.waveformArea}>
        {buffer && (
          <div className={styles.waveformClip} style={{ left: leftPos, width: canvasWidth + 10 }}>
            <div className={styles.trimHandleLeft} onPointerDown={handleTrimLeft} />
            <canvas ref={canvasRef} className={styles.waveformCanvas} onPointerDown={handleDragPointerDown} />
            <div className={styles.trimHandleRight} onPointerDown={handleTrimRight} />
          </div>
        )}
      </div>
    </div>
  )
}
```

---

### Task 9: Full component — top bar, timeline, handlers, landscape

**Files:**
- Modify: `src/pages/AudioPlusApp/index.tsx` (replace placeholder export)
- Modify: `src/pages/AudioPlusApp/AudioPlusApp.module.css` (full styles)

- [ ] **Step 1: Replace placeholder export with full component**

Replace the placeholder `export default function AudioPlusApp()` block with:

```tsx
export default function AudioPlusApp() {
  const [state, dispatch] = useReducer(reducer, initial)
  const isLandscapeMobile = useIsLandscapeMobile()

  const engineRef = useRef(new AudioPlusEngine())
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map())
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const gridCanvasRef = useRef<HTMLCanvasElement>(null)

  // Detect output latency once on mount
  useEffect(() => {
    const ms = engineRef.current.getLatencyMs()
    dispatch({ type: 'SET_LATENCY', ms })
  }, [])

  // Redraw BPM grid when bpm, zoom, or track count changes
  useEffect(() => {
    const canvas = gridCanvasRef.current
    const timeline = timelineRef.current
    if (!canvas || !timeline) return
    const totalWidth = Math.max(timeline.scrollWidth, timeline.clientWidth)
    const totalHeight = Math.max(timeline.scrollHeight, timeline.clientHeight, TRACK_ROW_HEIGHT)
    const dpr = window.devicePixelRatio || 1
    canvas.width = totalWidth * dpr
    canvas.height = totalHeight * dpr
    canvas.style.width = `${totalWidth}px`
    canvas.style.height = `${totalHeight}px`
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, totalWidth, totalHeight)
    const style = getComputedStyle(document.documentElement)
    const dimColor = style.getPropertyValue('--dim').trim()
    const ruleColor = style.getPropertyValue('--rule').trim()
    const beatInterval = (60 / state.bpm) * state.pxPerSec
    let beat = 0
    let x = SIDEBAR_WIDTH
    while (x < totalWidth) {
      ctx.fillStyle = beat % 4 === 0 ? dimColor : ruleColor
      ctx.fillRect(Math.round(x), 0, 1, totalHeight)
      x += beatInterval
      beat++
    }
  }, [state.bpm, state.pxPerSec, state.tracks.length])

  // ── Handlers ──────────────────────────────────────────────────────────────

  function getEngineTracks(): EngineTrack[] {
    return state.tracks
      .filter(t => buffersRef.current.has(t.id))
      .map(t => ({ ...t, buffer: buffersRef.current.get(t.id)! }))
  }

  function handlePlay() {
    if (state.isPlaying) return
    engineRef.current.play(getEngineTracks(), state.bpm, state.metronomeOn, (elapsed) => {
      dispatch({ type: 'SET_PLAYHEAD', time: elapsed })
    })
    dispatch({ type: 'SET_PLAYING', isPlaying: true })
  }

  function handleStop() {
    engineRef.current.stop()
    dispatch({ type: 'SET_PLAYING', isPlaying: false })
    dispatch({ type: 'SET_PLAYHEAD', time: 0 })
  }

  async function handleImport() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'audio/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const ctx = engineRef.current.getCtx()
      const arrayBuffer = await file.arrayBuffer()
      const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
      const id = crypto.randomUUID()
      buffersRef.current.set(id, buffer)
      dispatch({
        type: 'ADD_TRACK',
        track: {
          id,
          name: file.name.replace(/\.[^/.]+$/, ''),
          audioData: arrayBuffer,
          startOffset: 0,
          trimStart: 0,
          trimEnd: 0,
          volume: 1,
          pan: 0,
          muted: false,
        },
      })
    }
    input.click()
  }

  async function handleRecord() {
    dispatch({ type: 'SET_PHASE', phase: 'recording' })
    try {
      const { stream } = await engineRef.current.startRecording(
        getEngineTracks(), state.bpm, state.metronomeOn,
        (elapsed) => dispatch({ type: 'SET_PLAYHEAD', time: elapsed })
      )
      recordingStreamRef.current = stream
      dispatch({ type: 'SET_PLAYING', isPlaying: true })
    } catch {
      dispatch({ type: 'SET_PHASE', phase: 'idle' })
    }
  }

  async function handleStopRecord() {
    const stream = recordingStreamRef.current
    try {
      const { audioData, startOffset } = await engineRef.current.stopRecording(state.latencyOffsetMs)
      const ctx = engineRef.current.getCtx()
      const buffer = await ctx.decodeAudioData(audioData.slice(0))
      const id = crypto.randomUUID()
      buffersRef.current.set(id, buffer)
      dispatch({
        type: 'ADD_TRACK',
        track: {
          id,
          name: `track ${state.tracks.length + 1}`,
          audioData,
          startOffset,
          trimStart: 0,
          trimEnd: 0,
          volume: 1,
          pan: 0,
          muted: false,
        },
      })
    } finally {
      stream?.getTracks().forEach(t => t.stop())
      recordingStreamRef.current = null
      dispatch({ type: 'SET_PHASE', phase: 'idle' })
      dispatch({ type: 'SET_PLAYING', isPlaying: false })
      dispatch({ type: 'SET_PLAYHEAD', time: 0 })
    }
  }

  async function handleExport(format: 'wav' | 'mp3') {
    const active = getEngineTracks()
    if (active.length === 0) return
    const mixed = mixDown(active, engineRef.current.getCtx().sampleRate)
    const blob = format === 'wav' ? encodeWAV(mixed) : await encodeMP3(mixed)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${state.projectName}.${format}`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleSave(mode: 'full' | 'compact') {
    await saveProject({
      projectName: state.projectName,
      bpm: state.bpm,
      latencyOffsetMs: state.latencyOffsetMs,
      tracks: getEngineTracks().map(t => ({ ...t, audioData: state.tracks.find(st => st.id === t.id)!.audioData })),
      mode,
    })
  }

  async function handleLoad() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.audioplus'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const ctx = engineRef.current.getCtx()
      const { projectName, bpm, latencyOffsetMs, tracks, buffers } = await loadProject(file, ctx)
      buffersRef.current = buffers
      dispatch({ type: 'LOAD_PROJECT', projectName, bpm, latencyOffsetMs, tracks })
    }
    input.click()
  }

  // ── Timeline width ─────────────────────────────────────────────────────────

  const totalDuration = state.tracks.reduce((max, t) => {
    const buf = buffersRef.current.get(t.id)
    if (!buf) return max
    const end = Math.max(0, t.startOffset) + (buf.duration - t.trimStart - t.trimEnd)
    return Math.max(max, end)
  }, 0)
  const timelineContentWidth = Math.max(800, Math.round(totalDuration * state.pxPerSec) + SIDEBAR_WIDTH + 200)

  // ── Render ─────────────────────────────────────────────────────────────────

  const inner = (
    <div className={styles.content}>
      <div className={styles.topBar}>
        <input
          className={styles.projectName}
          value={state.projectName}
          onChange={e => dispatch({ type: 'SET_PROJECT_NAME', name: e.target.value })}
        />
        <div className={styles.bpmGroup}>
          <span className={styles.topLabel}>bpm</span>
          <input
            type="number"
            className={styles.bpmInput}
            value={state.bpm}
            min={20} max={300}
            onChange={e => dispatch({ type: 'SET_BPM', bpm: Number(e.target.value) })}
          />
          <button
            className={[styles.topBtn, state.metronomeOn ? styles.topBtnOn : ''].join(' ')}
            onClick={() => dispatch({ type: 'TOGGLE_METRONOME' })}
          >click</button>
        </div>
        <div className={styles.zoomGroup}>
          <span className={styles.topLabel}>zoom</span>
          <input
            type="range" min={20} max={400} step={10}
            value={state.pxPerSec}
            className={styles.zoomSlider}
            onChange={e => dispatch({ type: 'SET_PX_PER_SEC', pxPerSec: Number(e.target.value) })}
          />
        </div>
        <div className={styles.transport}>
          <button
            className={styles.transportBtn}
            onClick={state.isPlaying ? handleStop : handlePlay}
            disabled={state.phase === 'recording'}
          >{state.isPlaying ? '■' : '▶'}</button>
        </div>
        <div className={styles.fileActions}>
          <button className={styles.topBtn} onClick={handleLoad}>load</button>
          <button className={styles.topBtn} onClick={() => handleSave('compact')}>save</button>
          <button className={styles.topBtn} onClick={() => handleSave('full')} title="Save full quality (larger file)">save hq</button>
          <button className={styles.topBtn} onClick={() => handleExport('wav')} disabled={state.tracks.length === 0}>wav</button>
          <button className={styles.topBtn} onClick={() => handleExport('mp3')} disabled={state.tracks.length === 0}>mp3</button>
        </div>
      </div>

      <div className={styles.timeline} ref={timelineRef}>
        <canvas ref={gridCanvasRef} className={styles.gridCanvas} />
        <div
          className={styles.playhead}
          style={{ left: SIDEBAR_WIDTH + state.playheadTime * state.pxPerSec }}
        />
        <div style={{ minWidth: timelineContentWidth }}>
          {state.tracks.map(track => (
            <TrackRow
              key={track.id}
              track={track}
              buffer={buffersRef.current.get(track.id) ?? null}
              pxPerSec={state.pxPerSec}
              dispatch={dispatch}
            />
          ))}
          {state.tracks.length === 0 && (
            <div className={styles.emptyState}>import a file or record to add a track</div>
          )}
        </div>
      </div>

      <div className={styles.bottomBar}>
        <button className={styles.addBtn} onClick={handleImport}>+ import file</button>
        <button
          className={[styles.addBtn, state.phase === 'recording' ? styles.addBtnRecording : ''].join(' ')}
          onClick={state.phase === 'recording' ? handleStopRecord : handleRecord}
        >{state.phase === 'recording' ? '■ stop recording' : '● record'}</button>
      </div>
    </div>
  )

  if (isLandscapeMobile) {
    return <div className={styles.focusOverlay}>{inner}</div>
  }

  return (
    <div className={styles.app}>
      <AppHeader
        title="audio+"
        about={<>
          <p>A multitrack audio recorder and mixer.</p>
          <ul>
            <li>Import audio files or record from your microphone</li>
            <li>Drag tracks horizontally to reposition them on the timeline</li>
            <li>Trim tracks using the handles at each edge</li>
            <li>Set BPM and toggle the click track for recording reference</li>
            <li>Adjust volume and pan per track with the sliders</li>
            <li>Export the mix as WAV or MP3</li>
            <li>Save and reload your project as a .audioplus file</li>
            <li>Use headphones when recording to prevent feedback</li>
          </ul>
        </>}
      />
      {inner}
    </div>
  )
}
```

- [ ] **Step 2: Write full CSS**

Replace `src/pages/AudioPlusApp/AudioPlusApp.module.css` with:

```css
* {
  touch-action: manipulation;
}

.app {
  max-width: 100%;
  margin: 0 auto;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.focusOverlay {
  position: fixed;
  inset: 0;
  background: var(--bg);
  z-index: 120;
  display: flex;
  flex-direction: column;
}

.content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* ── Top bar ────────────────────────────────────────────────────────────────── */

.topBar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.6rem 1.5rem;
  border-bottom: 1px solid var(--rule);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.projectName {
  background: none;
  border: none;
  outline: none;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--fg);
  caret-color: var(--fg);
  min-width: 5rem;
  max-width: 12rem;
}

.bpmGroup,
.zoomGroup,
.transport,
.fileActions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.topLabel {
  font-family: var(--font-mono);
  font-size: 0.55rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--dim);
}

.bpmInput {
  background: none;
  border: none;
  outline: none;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--fg);
  width: 3rem;
  text-align: right;
  appearance: textfield;
  -moz-appearance: textfield;
}

.bpmInput::-webkit-inner-spin-button,
.bpmInput::-webkit-outer-spin-button {
  -webkit-appearance: none;
}

.topBtn {
  background: none;
  border: 1px solid var(--dim);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 0.3rem 0.6rem;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
  line-height: 1;
}

.topBtn:hover:not(:disabled) {
  border-color: var(--muted);
  color: var(--fg);
}

.topBtn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.topBtnOn {
  border-color: var(--fg);
  color: var(--fg);
}

.zoomSlider {
  width: 5rem;
  accent-color: var(--muted);
}

.transportBtn {
  background: none;
  border: 1px solid var(--dim);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.85rem;
  width: 2.2rem;
  height: 2.2rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s, color 0.15s;
}

.transportBtn:hover:not(:disabled) {
  border-color: var(--muted);
  color: var(--fg);
}

.transportBtn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* ── Timeline ───────────────────────────────────────────────────────────────── */

.timeline {
  position: relative;
  overflow-x: auto;
  overflow-y: auto;
  flex: 1;
  min-height: 120px;
}

.gridCanvas {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 0;
}

.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--fg);
  pointer-events: none;
  z-index: 4;
  opacity: 0.5;
}

.trackRow {
  display: flex;
  height: 72px;
  border-bottom: 1px solid var(--rule);
  position: relative;
  z-index: 1;
}

.sidebar {
  position: sticky;
  left: 0;
  width: 180px;
  min-width: 180px;
  background: var(--bg);
  border-right: 1px solid var(--rule);
  z-index: 2;
  display: flex;
  flex-direction: column;
  padding: 0.4rem 0.5rem;
  gap: 0.2rem;
}

.trackName {
  background: none;
  border: none;
  outline: none;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--fg);
  caret-color: var(--fg);
  width: 100%;
  padding: 0;
}

.sidebarControls {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.faderLabel {
  font-family: var(--font-mono);
  font-size: 0.5rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--dim);
  flex-shrink: 0;
}

.fader {
  flex: 1;
  height: 0.5rem;
  accent-color: var(--muted);
  min-width: 0;
}

.sidebarActions {
  display: flex;
  gap: 0.25rem;
}

.muteBtn {
  background: none;
  border: 1px solid var(--dim);
  color: var(--dim);
  font-family: var(--font-mono);
  font-size: 0.55rem;
  padding: 0.1rem 0.35rem;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
  line-height: 1;
}

.muteBtn:hover {
  border-color: var(--muted);
  color: var(--muted);
}

.muteBtnOn {
  border-color: var(--fg);
  color: var(--fg);
}

.deleteBtn {
  background: none;
  border: none;
  color: var(--dim);
  font-family: var(--font-mono);
  font-size: 0.85rem;
  cursor: pointer;
  padding: 0 0.2rem;
  line-height: 1;
  transition: color 0.15s;
}

.deleteBtn:hover {
  color: var(--fg);
}

.waveformArea {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.waveformClip {
  position: absolute;
  top: 8px;
  bottom: 8px;
  display: flex;
  align-items: stretch;
}

.waveformCanvas {
  display: block;
  cursor: grab;
  touch-action: none;
}

.waveformCanvas:active {
  cursor: grabbing;
}

.trimHandleLeft,
.trimHandleRight {
  width: 5px;
  cursor: ew-resize;
  background: var(--dim);
  flex-shrink: 0;
  touch-action: none;
  opacity: 0.5;
  transition: opacity 0.15s;
}

.trimHandleLeft:hover,
.trimHandleRight:hover {
  opacity: 1;
}

.emptyState {
  padding: 2rem 1.5rem;
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--dim);
  margin-left: 180px;
}

/* ── Bottom bar ─────────────────────────────────────────────────────────────── */

.bottomBar {
  display: flex;
  gap: 0.75rem;
  padding: 0.6rem 1.5rem;
  border-top: 1px solid var(--rule);
  flex-shrink: 0;
}

.addBtn {
  background: none;
  border: 1px solid var(--dim);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 0.4rem 0.85rem;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
  line-height: 1;
}

.addBtn:hover {
  border-color: var(--muted);
  color: var(--fg);
}

.addBtnRecording {
  border-color: var(--fg);
  color: var(--fg);
}

/* ── Landscape ──────────────────────────────────────────────────────────────── */

@media (orientation: landscape) and (pointer: coarse) {
  .topBar {
    padding: 0.35rem 1rem;
    gap: 0.6rem;
  }

  .bottomBar {
    padding: 0.35rem 1rem;
  }
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build` — expect no TypeScript errors.

- [ ] **Step 4: Smoke test**

Run: `npm run dev`, visit `/audioplus`:
- Header shows "audio+"
- Top bar shows project name, BPM input, click toggle, zoom slider, transport, and file action buttons
- Empty timeline with empty state message
- Bottom bar shows import and record buttons

- [ ] **Step 5: Commit**

```bash
git add src/pages/AudioPlusApp/index.tsx src/pages/AudioPlusApp/AudioPlusApp.module.css
git commit -m "Add AudioPlus component: timeline, track rows, transport, BPM grid, save/load/export"
```

---

## Verification Checklist

After implementation is complete, verify end-to-end:

- [ ] Import an audio file → waveform appears at offset 0
- [ ] Import a second file → second track row appears below first
- [ ] Press play → both tracks play in sync
- [ ] Adjust volume slider on one track → that track is louder/quieter in playback
- [ ] Adjust pan slider → audio shifts left/right
- [ ] Click M button → track muted (silent during playback)
- [ ] Click × → track removed
- [ ] Drag waveform left/right → track repositions on timeline
- [ ] Drag left trim handle right → waveform shortens from left
- [ ] Drag right trim handle left → waveform shortens from right
- [ ] Toggle "click" button → audible metronome click during playback
- [ ] Change BPM → grid lines update spacing
- [ ] Change zoom slider → waveforms scale
- [ ] Record button → mic permission requested, recording starts, existing tracks play
- [ ] Stop recording → new track appears with latency-corrected offset
- [ ] Export WAV → file downloads and plays correctly in external app
- [ ] Export MP3 → file downloads and plays correctly
- [ ] Save (compact) → `.audioplus` file downloads
- [ ] Load `.audioplus` file → project state fully restored
- [ ] Rotate to landscape on mobile → focus overlay shown, timeline usable
- [ ] Dark mode and light mode both look correct
