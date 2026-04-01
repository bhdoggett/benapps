# AudioPlus App — Design Spec
*Date: 2026-03-31*

## Context

The existing AudioApp handles single-file audio editing (trim, normalize, reverse, export). AudioPlus extends this into a stripped-down multitrack DAW: multiple tracks recorded or imported, layered on a shared timeline, mixed and exported. Primary use case is overdub recording — singing or playing along to previously recorded tracks.

---

## Layout

Three vertical zones:

**Top bar**
- Project name (editable inline)
- BPM input + metronome toggle (audible click, same engine as MetronomeApp)
- Zoom control (pixels per second, default 100px/s)
- Transport: Play / Stop
- Right-side buttons: Save (with quality choice), Load, Export (WAV or MP3)

**Timeline area** (horizontally scrollable, fills remaining height)
- Full-width BPM grid canvas behind all tracks (`pointer-events: none`)
- Playhead line overlaid on top
- Each track is a row:
  - **Left sidebar** (fixed, doesn't scroll): track name (editable), volume fader, pan slider, mute button, delete button
  - **Right waveform area** (scrolls): `<canvas>` absolutely positioned at `startOffset × pxPerSec` pixels. Draggable horizontally. Trim handles at each end (same pattern as AudioApp).

**Bottom bar**
- "Add track" button → choice: record from mic or import file

---

## Track Data Model

```typescript
type Track = {
  id: string
  name: string
  audioData: ArrayBuffer   // raw bytes — used for serialization
  startOffset: number      // seconds from timeline start (can be negative pre-correction)
  trimStart: number        // seconds trimmed from buffer start
  trimEnd: number          // seconds trimmed from buffer end
  volume: number           // 0–1
  pan: number              // -1 (left) to +1 (right)
  muted: boolean
}
```

`AudioBuffer` objects (decoded from `audioData`) are stored in a `Map<id, AudioBuffer>` ref outside the reducer — same pattern as AudioApp — since AudioBuffers are not serializable and React should not diff them.

**App state:**

```typescript
type State = {
  phase: 'idle' | 'recording' | 'calibrating'
  projectName: string
  bpm: number
  metronomeOn: boolean
  isPlaying: boolean
  playheadTime: number
  tracks: Track[]
  latencyOffsetMs: number
}
```

---

## Playback Engine

Single shared `AudioContext`, lazily initialized on first interaction.

Signal chain per track:
```
AudioBufferSourceNode → GainNode (volume) → StereoPannerNode (pan) → master GainNode → destination
```

On play:
- `startAt = audioCtx.currentTime + 0.05`
- For each non-muted track: `source.start(startAt + track.startOffset, track.trimStart, duration)`
- Tracks with `startOffset < 0` are clamped: buffer playback begins at `-startOffset` seconds in
- All source nodes stored in a ref for `.stop()` on transport stop
- Playhead advances via `requestAnimationFrame`

If metronome is on, click beats are scheduled with the same look-ahead pattern as MetronomeApp, running alongside tracks.

---

## Recording + Latency Correction

**Overdub recording:**
1. User presses record
2. Existing tracks + optional click begin playing (`AudioBufferSourceNode`s scheduled)
3. `MediaRecorder` starts simultaneously, collecting mic chunks
4. On stop: blob decoded to `AudioBuffer`, `latencyOffsetMs` subtracted from `startOffset`
5. Track added to timeline at corrected position

**Latency calibration (silent, browser API):**
- Default: `latencyOffsetMs = (audioCtx.outputLatency + audioCtx.baseLatency) × 1000` + estimated input latency from `MediaStreamTrack.getSettings().latency`
- Applied automatically — no user action required
- Optional acoustic calibration available ("improve accuracy"): play a click, record it, detect peak, measure delta
- Calibration result saved with project
- Note shown: "use headphones during recording to prevent feedback"

---

## BPM Grid

- Beat interval in pixels: `(60 / bpm) × pxPerSec`
- Rendered on a full-width canvas behind the track rows
- Bar lines (every 4 beats) drawn slightly brighter than beat lines
- Updates when BPM or zoom changes
- Purely visual — no auto-quantization

---

## Save / Load / Export

**Save project (`.audioplus` file):**
- JSON containing all state fields + per-track `audioData` base64-encoded
- Two modes at save time:
  - **Full quality**: preserves original `audioData` bytes as-is
  - **Compact**: re-encodes each track to WAV before base64-encoding (smaller file)

**Load project:**
- File picker accepts `.audioplus`
- JSON parsed → base64 decoded → each track's `audioData` decoded via `AudioContext.decodeAudioData()` → AudioBuffers restored into the buffers ref

**Export mixed-down:**
- Compute total duration from latest track end
- Create output `AudioBuffer`
- For each non-muted track: copy samples at correct offset, applying volume + pan
- Two format buttons:
  - **WAV**: via `src/utils/audio/wavEncoder.ts`
  - **MP3**: via `src/utils/audio/mp3Encoder.ts` (lamejs, already in project)
- Download as `{projectName}.wav` or `{projectName}.mp3`

---

## Shared Utilities — File Relocation

`wavEncoder.ts` and `mp3Encoder.ts` are moved from `src/pages/AudioApp/` to `src/utils/audio/`. AudioApp's imports are updated to the new path. No logic changes.

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `src/pages/AudioPlusApp/index.tsx` | Create |
| `src/pages/AudioPlusApp/AudioPlusApp.module.css` | Create |
| `src/utils/audio/wavEncoder.ts` | Move from AudioApp |
| `src/utils/audio/mp3Encoder.ts` | Move from AudioApp |
| `src/pages/AudioApp/index.tsx` | Update imports to new encoder paths |
| `src/App.tsx` | Add `/audioplus` route |
| `src/pages/Landing/index.tsx` | Add `{ path: '/audioplus', name: 'audio+' }` under media section |

---

## Verification

1. `npm run dev` — visit `/audioplus`
2. Import an audio file → waveform appears on timeline at offset 0
3. Import a second file → second track row appears
4. Press play → both tracks play in sync; adjust volume/pan per track
5. Toggle metronome → click plays alongside tracks
6. Record a new track → appears at latency-corrected offset
7. Drag track → updates position on timeline
8. Trim handles → trim without affecting other tracks' positions
9. Save project → download `.audioplus` file; reload page → load project → state fully restored
10. Export WAV and MP3 → files download and play correctly in external app
11. Rotate to landscape on mobile → focus overlay active
