import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import AppHeader from '../../components/AppHeader'
import RangeSlider from '../../components/RangeSlider'
import styles from './PianoApp.module.css'

// ── Key data ─────────────────────────────────────────────────────────────────

type KeyData = { midi: number; isBlack: boolean; whiteIndex: number }

// Semitone pattern C C# D D# E F F# G G# A A# B
const IS_BLACK = [false, true, false, true, false, false, true, false, true, false, true, false]

function buildKeys(): KeyData[] {
  const keys: KeyData[] = []
  let w = 0
  for (let midi = 36; midi <= 84; midi++) {
    const isBlack = IS_BLACK[midi % 12]
    keys.push({ midi, isBlack, whiteIndex: w })
    if (!isBlack) w++
  }
  return keys
}

const ALL_KEYS = buildKeys()
const WHITE_KEYS = ALL_KEYS.filter(k => !k.isBlack)
const TOTAL_WHITE_KEYS = WHITE_KEYS.length // 29
// Maps whiteIndex → black key sitting on that index boundary.
// C# gets whiteIndex == D's whiteIndex, so get(W+1) finds the black key right of white key W.
const BLACK_KEY_MAP = new Map(ALL_KEYS.filter(k => k.isBlack).map(k => [k.whiteIndex, k]))
const C4_WHITE_INDEX = 14 // MIDI 60
const DRAG_THRESHOLD = 6 // px before a tap becomes a scroll drag
const NOTE_LETTERS = ['C', '', 'D', '', 'E', 'F', '', 'G', '', 'A', '', 'B']

// ── Helpers ───────────────────────────────────────────────────────────────────

function midiFreq(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

// ── Component ─────────────────────────────────────────────────────────────────

type OscEntry = { osc1: OscillatorNode; osc2: OscillatorNode; gain: GainNode }

function LockIcon({ locked }: { locked: boolean }) {
  if (locked) {
    return (
      <svg viewBox="0 0 24 24" className={styles.lockIcon} aria-hidden="true">
        <rect x="6" y="10" width="12" height="10" rx="1" className={styles.lockBodyFilled} />
        <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" className={styles.lockIcon} aria-hidden="true">
      <rect x="6" y="10" width="12" height="10" rx="1" />
      <path d="M15.5 6V5.5a3.5 3.5 0 0 0-7 0V10" />
    </svg>
  )
}

export default function PianoApp() {
  const [locked, setLocked] = useState(true)
  const [showNoteNames, setShowNoteNames] = useState(false)
  const [keyWidth, setKeyWidth] = useState(48)
  const [scrollX, setScrollX] = useState(0)
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set())

  const audioCtxRef = useRef<AudioContext | null>(null)
  const activeOscRef = useRef(new Map<number, OscEntry>())

  // Tracks which pointerIds are currently pressed (pointerdown but not yet up)
  const activePointersRef = useRef(new Set<number>())
  // Locked mode: maps pointerId → the midi note it is currently pressing
  const pointerNotesRef = useRef(new Map<number, number>())

  // Scroll mode (unlocked): single-pointer scroll tracking
  const scrollPointerRef = useRef<number | null>(null)
  const dragStartXRef = useRef(0)
  const dragStartScrollRef = useRef(0)
  // In unlocked mode, a tap (below drag threshold) plays a note; dragging scrolls instead
  const isDraggingRef = useRef(false)
  const tapNoteRef = useRef<number | null>(null) // note playing during unlocked tap

  const pianoWrapperRef = useRef<HTMLDivElement>(null)
  const scrollXRef = useRef(0)
  const keyWidthRef = useRef(48)
  const lockedRef = useRef(true)

  useEffect(() => { lockedRef.current = locked }, [locked])

  // ── Audio engine ────────────────────────────────────────────────────────────

  function getCtx() {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
    audioCtxRef.current.resume()
    return audioCtxRef.current
  }

  function noteOn(midi: number) {
    if (activeOscRef.current.has(midi)) return
    const ctx = getCtx()
    const freq = midiFreq(midi)
    const now = ctx.currentTime

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.7, now + 0.005)
    gain.gain.linearRampToValueAtTime(0.15, now + 0.12)
    gain.connect(ctx.destination)

    const osc1 = ctx.createOscillator()
    osc1.type = 'triangle'
    osc1.frequency.value = freq
    osc1.connect(gain)
    osc1.start(now)

    const gain2 = ctx.createGain()
    gain2.gain.value = 0.25
    gain2.connect(gain)

    const osc2 = ctx.createOscillator()
    osc2.type = 'sine'
    osc2.frequency.value = freq * 2
    osc2.connect(gain2)
    osc2.start(now)

    activeOscRef.current.set(midi, { osc1, osc2, gain })
    setActiveNotes(prev => new Set([...prev, midi]))
  }

  function noteOff(midi: number) {
    const entry = activeOscRef.current.get(midi)
    if (!entry) return
    activeOscRef.current.delete(midi)
    setActiveNotes(prev => { const s = new Set(prev); s.delete(midi); return s })

    const ctx = audioCtxRef.current
    if (!ctx || ctx.state === 'closed') return

    const { osc1, osc2, gain } = entry
    const now = ctx.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.001), now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15)
    osc1.stop(now + 0.16)
    osc2.stop(now + 0.16)
  }

  function noteOffAll() {
    for (const midi of Array.from(activeOscRef.current.keys())) noteOff(midi)
  }

  useEffect(() => {
    return () => {
      activeOscRef.current.forEach(({ osc1, osc2 }) => {
        try { osc1.stop(0); osc2.stop(0) } catch (_) { /* already stopped */ }
      })
      activeOscRef.current.clear()
      audioCtxRef.current?.close()
    }
  }, [])

  // Wheel scroll — must be a non-passive native listener to allow preventDefault
  useEffect(() => {
    const wrapper = pianoWrapperRef.current
    if (!wrapper) return
    function onWheel(e: WheelEvent) {
      if (lockedRef.current) return
      e.preventDefault()
      const maxScroll = Math.max(0, TOTAL_WHITE_KEYS * keyWidthRef.current - wrapper!.clientWidth)
      const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY
      const next = clamp(scrollXRef.current + delta, 0, maxScroll)
      scrollXRef.current = next
      setScrollX(next)
    }
    wrapper.addEventListener('wheel', onWheel, { passive: false })
    return () => wrapper.removeEventListener('wheel', onWheel)
  }, [])

  // ── Hit testing ─────────────────────────────────────────────────────────────

  function midiFromPointer(clientX: number, clientY: number): number | null {
    const wrapper = pianoWrapperRef.current
    if (!wrapper) return null
    const rect = wrapper.getBoundingClientRect()
    const relX = clientX - rect.left + scrollXRef.current
    const relY = clientY - rect.top
    if (relX < 0 || relY < 0 || relY > rect.height) return null

    const kw = keyWidthRef.current
    const bkw = Math.round(kw * 0.65)
    const inBlackZone = relY < rect.height * 0.6

    const whiteIdx = Math.floor(relX / kw)
    if (whiteIdx < 0 || whiteIdx >= TOTAL_WHITE_KEYS) return null
    const posInKey = relX - whiteIdx * kw

    if (inBlackZone) {
      // Right-side black key (overhangs into next white key's territory)
      if (posInKey >= kw - Math.round(bkw / 2)) {
        const bk = BLACK_KEY_MAP.get(whiteIdx + 1)
        if (bk) return bk.midi
      }
      // Left-side black key (overhangs from previous white key)
      if (posInKey <= Math.round(bkw / 2)) {
        const bk = BLACK_KEY_MAP.get(whiteIdx)
        if (bk) return bk.midi
      }
    }

    return WHITE_KEYS[whiteIdx].midi
  }

  // ── Pointer handlers ────────────────────────────────────────────────────────

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    activePointersRef.current.add(e.pointerId)

    if (lockedRef.current) {
      const midi = midiFromPointer(e.clientX, e.clientY)
      if (midi !== null) {
        noteOn(midi)
        pointerNotesRef.current.set(e.pointerId, midi)
      }
    } else {
      scrollPointerRef.current = e.pointerId
      dragStartXRef.current = e.clientX
      dragStartScrollRef.current = scrollXRef.current
      isDraggingRef.current = false
      // Play the tapped note immediately; cancel it if the gesture becomes a drag
      const midi = midiFromPointer(e.clientX, e.clientY)
      if (midi !== null) {
        noteOn(midi)
        tapNoteRef.current = midi
      }
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!activePointersRef.current.has(e.pointerId)) return

    if (lockedRef.current) {
      // Slide across keys: release old key, press new key
      const prevMidi = pointerNotesRef.current.get(e.pointerId)
      const midi = midiFromPointer(e.clientX, e.clientY)

      if (midi !== prevMidi) {
        if (prevMidi !== undefined) noteOff(prevMidi)
        if (midi !== null) {
          noteOn(midi)
          pointerNotesRef.current.set(e.pointerId, midi)
        } else {
          pointerNotesRef.current.delete(e.pointerId)
        }
      }
    } else {
      if (scrollPointerRef.current !== e.pointerId) return

      if (!isDraggingRef.current) {
        const dx = Math.abs(e.clientX - dragStartXRef.current)
        if (dx < DRAG_THRESHOLD) return // still within tap zone
        // Crossed threshold — become a scroll drag and release the tap note
        isDraggingRef.current = true
        if (tapNoteRef.current !== null) {
          noteOff(tapNoteRef.current)
          tapNoteRef.current = null
        }
      }

      const wrapper = pianoWrapperRef.current
      if (!wrapper) return
      const maxScroll = Math.max(0, TOTAL_WHITE_KEYS * keyWidthRef.current - wrapper.clientWidth)
      const next = clamp(dragStartScrollRef.current - (e.clientX - dragStartXRef.current), 0, maxScroll)
      scrollXRef.current = next
      setScrollX(next)
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    activePointersRef.current.delete(e.pointerId)
    if (lockedRef.current) {
      const prevMidi = pointerNotesRef.current.get(e.pointerId)
      if (prevMidi !== undefined) noteOff(prevMidi)
      pointerNotesRef.current.delete(e.pointerId)
    } else {
      if (scrollPointerRef.current === e.pointerId) {
        scrollPointerRef.current = null
        if (tapNoteRef.current !== null) {
          noteOff(tapNoteRef.current)
          tapNoteRef.current = null
        }
        isDraggingRef.current = false
      }
    }
  }

  function handlePointerLeave() {
    // Fallback: release everything when capture is lost or pointer exits
    noteOffAll()
    activePointersRef.current.clear()
    pointerNotesRef.current.clear()
    scrollPointerRef.current = null
    tapNoteRef.current = null
    isDraggingRef.current = false
  }

  // ── Scroll positioning ───────────────────────────────────────────────────────

  const isMountedRef = useRef(false)

  useLayoutEffect(() => {
    const wrapper = pianoWrapperRef.current
    if (!wrapper) return
    const ww = wrapper.clientWidth
    const newKw = keyWidth
    const maxScroll = Math.max(0, TOTAL_WHITE_KEYS * newKw - ww)

    let sx: number
    if (!isMountedRef.current) {
      // Initial mount: center on C4
      isMountedRef.current = true
      sx = clamp(C4_WHITE_INDEX * newKw - ww / 2 + newKw / 2, 0, maxScroll)
    } else {
      // Key width change: keep the same piano position centered in the viewport
      const centeredAt = (scrollXRef.current + ww / 2) / keyWidthRef.current
      sx = clamp(centeredAt * newKw - ww / 2, 0, maxScroll)
    }

    scrollXRef.current = sx
    keyWidthRef.current = newKw
    setScrollX(sx)
  }, [keyWidth]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ──────────────────────────────────────────────────────────────────

  const blackKeyWidth = Math.round(keyWidth * 0.65)

  return (
    <div className={styles.app}>
      <div className={styles.header}>
        <AppHeader
          title="piano"
          about={<>
            <p>A scrollable piano spanning C2–C6, synthesized in the browser with no downloads.</p>
            <ul>
              <li><strong>Lock mode</strong> — press and slide to play notes. Each key triggers on entry and releases on exit.</li>
              <li><strong>Unlock mode</strong> — tap a key to play it; drag left or right to scroll through octaves.</li>
              <li>Use the key size slider to zoom in or out.</li>
              <li>Toggle the note names button to label every key.</li>
              <li>Rotate to landscape for a distraction-free full-screen view.</li>
            </ul>
          </>}
        />
      </div>

      <div className={styles.controls}>
        <button
          className={`${styles.lockBtn} ${locked ? styles.lockBtnActive : ''}`}
          type="button"
          aria-label={locked ? 'locked' : 'unlocked'}
          title={locked ? 'locked' : 'unlocked'}
          onClick={() => setLocked(l => !l)}
        >
          <LockIcon locked={locked} />
        </button>
        <button
          className={`${styles.lockBtn} ${showNoteNames ? styles.lockBtnActive : ''}`}
          type="button"
          aria-label="toggle note names"
          title="toggle note names"
          onClick={() => setShowNoteNames(s => !s)}
        >
          <svg viewBox="0 0 24 24" className={styles.lockIcon} aria-hidden="true">
            <path d="M9 18V6l10-2v12" strokeWidth="1.6" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="7" cy="18" r="2" fill="none" stroke="currentColor" strokeWidth="1.6" className={showNoteNames ? styles.lockBodyFilled : ''} />
            <circle cx="17" cy="16" r="2" fill="none" stroke="currentColor" strokeWidth="1.6" className={showNoteNames ? styles.lockBodyFilled : ''} />
          </svg>
        </button>
        <span className={styles.label}>key size</span>
        <RangeSlider
          min={32}
          max={80}
          value={keyWidth}
          onChange={setKeyWidth}
          className={styles.slider}
        />
      </div>

      <div
        ref={pianoWrapperRef}
        className={`${styles.pianoWrapper} ${locked ? styles.cursorPlay : styles.cursorScroll}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        <div
          className={styles.piano}
          style={{
            width: TOTAL_WHITE_KEYS * keyWidth,
            transform: `translateX(${-scrollX}px)`,
          }}
        >
          {WHITE_KEYS.map((wk, W) => {
            const bk = BLACK_KEY_MAP.get(W + 1)
            const wActive = activeNotes.has(wk.midi)
            const bActive = bk != null && activeNotes.has(bk.midi)
            const octave = Math.floor(wk.midi / 12) - 1
            const isC = wk.midi % 12 === 0
            const noteLabel = showNoteNames
              ? `${NOTE_LETTERS[wk.midi % 12]}${octave}`
              : isC ? String(octave) : null

            return (
              <div
                key={wk.midi}
                className={`${styles.whiteKey} ${wActive ? styles.whiteKeyActive : ''}`}
                style={{ width: keyWidth }}
                data-midi={wk.midi}
              >
                {bk && (
                  <div
                    className={`${styles.blackKey} ${bActive ? styles.blackKeyActive : ''}`}
                    style={{
                      width: blackKeyWidth,
                      left: keyWidth - Math.round(blackKeyWidth / 2),
                    }}
                    data-midi={bk.midi}
                  />
                )}
                {noteLabel && (
                  <span className={styles.octaveLabel}>{noteLabel}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
