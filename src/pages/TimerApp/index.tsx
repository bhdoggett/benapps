import { useEffect, useRef, useState } from 'react'
import AppHeader from '../../components/AppHeader'
import styles from './TimerApp.module.css'

type TimerMode = 'idle' | 'running' | 'paused' | 'done'
type TimerType = 'countdown' | 'stopwatch'

interface TimerState {
  mode: TimerMode
  type: TimerType
  totalMs: number
  startedAt: number
  accumulatedMs: number
}

const PRESETS = [1, 2, 3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]

const idle: TimerState = {
  mode: 'idle',
  type: 'countdown',
  totalMs: 0,
  startedAt: 0,
  accumulatedMs: 0,
}

function formatTime(ms: number, showCentiseconds = false): string {
  const clamped = Math.max(0, ms)
  const totalSec = Math.floor(clamped / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const t = Math.floor((clamped % 1000) / 100)
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  const base = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return showCentiseconds ? `${base}.${t}` : base
}

function getElapsed(state: TimerState): number {
  if (state.mode === 'running') {
    return state.accumulatedMs + (Date.now() - state.startedAt)
  }
  return state.accumulatedMs
}

export default function TimerApp() {
  const [timer, setTimer] = useState<TimerState>(idle)
  const [, setTick] = useState(0)
  const notifiedRef = useRef(false)

  useEffect(() => {
    if (timer.mode !== 'running') return
    const id = setInterval(() => {
      setTick(t => t + 1)
      if (timer.type === 'countdown') {
        const elapsed = getElapsed(timer)
        if (elapsed >= timer.totalMs) {
          setTimer(prev => ({ ...prev, mode: 'done', accumulatedMs: prev.totalMs }))
        }
      }
    }, 100)
    return () => clearInterval(id)
  }, [timer])

  useEffect(() => {
    if (timer.mode === 'done' && !notifiedRef.current) {
      notifiedRef.current = true
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('timer done')
      }
    }
    if (timer.mode !== 'done') {
      notifiedRef.current = false
    }
  }, [timer.mode])

  function startCountdown(minutes: number) {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    setTimer({
      mode: 'running',
      type: 'countdown',
      totalMs: minutes * 60 * 1000,
      startedAt: Date.now(),
      accumulatedMs: 0,
    })
  }

  function startStopwatch() {
    setTimer({
      mode: 'running',
      type: 'stopwatch',
      totalMs: 0,
      startedAt: Date.now(),
      accumulatedMs: 0,
    })
  }

  function pause() {
    setTimer(prev => ({
      ...prev,
      mode: 'paused',
      accumulatedMs: getElapsed(prev),
    }))
  }

  function resume() {
    setTimer(prev => ({
      ...prev,
      mode: 'running',
      startedAt: Date.now(),
    }))
  }

  function reset() {
    setTimer({
      mode: 'paused',
      type: 'stopwatch',
      totalMs: 0,
      startedAt: Date.now(),
      accumulatedMs: 0,
    })
  }

  function dismiss() {
    setTimer(idle)
  }

  if (timer.mode !== 'idle') {
    const elapsed = getElapsed(timer)
    const isDone = timer.mode === 'done'
    const displayMs = timer.type === 'countdown' ? timer.totalMs - elapsed : elapsed
    const timeStr = isDone ? '00:00' : formatTime(displayMs, timer.type === 'stopwatch')

    const label = timer.type === 'countdown'
      ? (isDone ? 'done' : `${timer.totalMs / 60000} min`)
      : 'stopwatch'

    return (
      <div className={styles.overlay}>
        <div className={styles.timerInner}>
          <div className={styles.labelRow}>
            <div className={styles.presetLabel}>{label}</div>
            <button className={styles.closeBtn} onClick={dismiss} aria-label="dismiss">×</button>
          </div>
          <div className={`${styles.timeDisplay}${isDone ? ` ${styles.done}` : ''}`}>
            {timeStr}
          </div>
          {!isDone && (
            <div className={styles.controlRow}>
              <button
                className={styles.controlBtn}
                onClick={timer.mode === 'running' ? pause : resume}
              >
                {timer.mode === 'running' ? 'pause' : 'resume'}
              </button>
              {label === 'stopwatch' && (
                <button className={styles.controlBtn} onClick={reset}>
                  reset
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.app}>
      <AppHeader title="timer" />
      <div className={styles.section}>
        <div className={styles.sectionLabel}>countdown</div>
        <div className={styles.presetGrid}>
          {PRESETS.map(m => (
            <button key={m} className={styles.presetBtn} onClick={() => startCountdown(m)}>
              {m}m
            </button>
          ))}
        </div>
      </div>
      <div className={styles.section}>
        <div className={styles.sectionLabel}>stopwatch</div>
        <div className={styles.centeredRow}>
          <button className={styles.startBtn} onClick={startStopwatch}>start</button>
        </div>
      </div>
    </div>
  )
}
