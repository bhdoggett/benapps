import { useEffect, useReducer, useRef, useCallback, useState } from 'react'
import AppHeader from '../../components/AppHeader'
import ActionButton from '../../components/ActionButton'
import DragNumber from '../../components/DragNumber'
import StatusMessage from '../../components/StatusMessage'
import { useAbout } from '../../contexts/AboutContext'
import styles from './DrawApp.module.css'

type CropRect = { x: number; y: number; w: number; h: number }

type State = {
  color: string
  brushSize: number
  copied: boolean
  recentColors: string[]
  cropMode: boolean
  cropRect: CropRect | null
  canvasW: number
  canvasH: number
}

type Action =
  | { type: 'SET_COLOR'; color: string }
  | { type: 'SET_BRUSH_SIZE'; size: number }
  | { type: 'SET_COPIED'; copied: boolean }
  | { type: 'ADD_RECENT_COLOR'; color: string }
  | { type: 'TOGGLE_CROP_MODE' }
  | { type: 'SET_CROP_RECT'; rect: CropRect | null }
  | { type: 'SET_CANVAS_W'; w: number }
  | { type: 'SET_CANVAS_H'; h: number }

const initial: State = {
  color: '#000000',
  brushSize: 4,
  copied: false,
  recentColors: [],
  cropMode: false,
  cropRect: null,
  canvasW: 1240,
  canvasH: 840,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_COLOR': return { ...state, color: action.color }
    case 'SET_BRUSH_SIZE': return { ...state, brushSize: action.size }
    case 'SET_COPIED': return { ...state, copied: action.copied }
    case 'ADD_RECENT_COLOR': {
      const filtered = state.recentColors.filter(c => c !== action.color)
      return { ...state, recentColors: [action.color, ...filtered].slice(0, 1) }
    }
    case 'TOGGLE_CROP_MODE':
      return { ...state, cropMode: !state.cropMode, cropRect: null }
    case 'SET_CROP_RECT':
      return { ...state, cropRect: action.rect }
    case 'SET_CANVAS_W': return { ...state, canvasW: action.w }
    case 'SET_CANVAS_H': return { ...state, canvasH: action.h }
  }
}

const SWATCHES = [
  '#000000', '#ffffff', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#3b82f6', '#a855f7',
]

// [brushSize, visual circle radius in 16×16 SVG viewBox]
const SIZE_PRESETS: [number, number][] = [
  [2,   2],
  [6,   3.5],
  [16,  5],
  [40,  6.5],
  [100, 8],
]

const MAX_HISTORY = 30

export default function DrawApp() {
  const [state, dispatch] = useReducer(reducer, initial)
  const { setContent, setIsOpen } = useAbout()

  useEffect(() => {
    setContent(
      <>
        <p>
          A simple sketchpad for signatures, quick sketches, and anything in between.
          Works with mouse, touch, or stylus. Use white to erase.
        </p>
        <p>
          Click a size dot to quickly switch brush size, or drag the size input for
          fine control. Use the crop button to define an export region.
        </p>
        <p>
          Keyboard shortcuts: <strong>Cmd+Z</strong> to undo,{' '}
          <strong>Cmd+Shift+Z</strong> to redo, <strong>Esc</strong> to cancel crop.
        </p>
      </>
    )
    return () => {
      setContent(null)
      setIsOpen(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)
  const cropStart = useRef<{ x: number; y: number } | null>(null)
  const historyRef = useRef<ImageData[]>([])
  const historyIndexRef = useRef(-1)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingResizeRef = useRef<HTMLImageElement | null>(null)
  // actualDims tracks the canvas element's real pixel dimensions — only updated on commit
  // so live drag previews (canvasW/H state changes) don't reset the canvas.
  const actualDimsRef = useRef({ w: initial.canvasW, h: initial.canvasH })
  const [commitCount, setCommitCount] = useState(0)
  const resizeDragRef = useRef<{ startX: number; startY: number; startW: number; startH: number; displayW: number; displayH: number } | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  // Only fires on explicit commit (not on every live drag tick).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (pendingResizeRef.current) {
      const img = pendingResizeRef.current
      const apply = () => {
        ctx.drawImage(img, 0, 0)
        historyRef.current = [ctx.getImageData(0, 0, canvas.width, canvas.height)]
        historyIndexRef.current = 0
        pendingResizeRef.current = null
      }
      if (img.complete) apply()
      else img.onload = apply
    } else {
      historyRef.current = [ctx.getImageData(0, 0, canvas.width, canvas.height)]
      historyIndexRef.current = 0
    }
  }, [commitCount]) // eslint-disable-line react-hooks/exhaustive-deps

  const commitResize = (w: number, h: number) => {
    const cw = Math.round(Math.max(200, Math.min(1240, w)) / 10) * 10
    const ch = Math.round(Math.max(200, Math.min(2000, h)) / 10) * 10
    if (cw === actualDimsRef.current.w && ch === actualDimsRef.current.h) return
    const canvas = canvasRef.current
    if (!canvas) return
    const img = new Image()
    img.src = canvas.toDataURL()
    pendingResizeRef.current = img
    actualDimsRef.current = { w: cw, h: ch }
    dispatch({ type: 'SET_CANVAS_W', w: cw })
    dispatch({ type: 'SET_CANVAS_H', h: ch })
    setCommitCount(c => c + 1)
  }

  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    resizeDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: stateRef.current.canvasW,
      startH: stateRef.current.canvasH,
      displayW: rect.width,
      displayH: rect.height,
    }
  }

  const handleResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = resizeDragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    const scaleX = drag.startW / drag.displayW
    const scaleY = drag.startH / drag.displayH
    const newW = Math.round(Math.max(200, Math.min(1240, drag.startW + dx * scaleX)) / 10) * 10
    const newH = Math.round(Math.max(200, Math.min(2000, drag.startH + dy * scaleY)) / 10) * 10
    dispatch({ type: 'SET_CANVAS_W', w: newW })
    dispatch({ type: 'SET_CANVAS_H', h: newH })
  }

  const handleResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = resizeDragRef.current
    if (!drag) return
    resizeDragRef.current = null
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    const scaleX = drag.startW / drag.displayW
    const scaleY = drag.startH / drag.displayH
    const newW = Math.round(Math.max(200, Math.min(1240, drag.startW + dx * scaleX)) / 10) * 10
    const newH = Math.round(Math.max(200, Math.min(2000, drag.startH + dy * scaleY)) / 10) * 10
    commitResize(newW, newH)
  }

  // Draw crop overlay
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    const ctx = overlay.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, state.canvasW, state.canvasH)

    const rect = state.cropRect
    if (!rect || !state.cropMode) return

    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(0, 0, state.canvasW, state.canvasH)
    ctx.clearRect(rect.x, rect.y, rect.w, rect.h)
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 2
    ctx.setLineDash([8, 6])
    ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2)
    ctx.setLineDash([])
  }, [state.cropMode, state.cropRect])

  const getCanvasPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: Math.round((e.clientX - rect.left) * (stateRef.current.canvasW / rect.width)),
      y: Math.round((e.clientY - rect.top) * (stateRef.current.canvasH / rect.height)),
    }
  }

  const saveHistory = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1)
    newHistory.push(snapshot)
    if (newHistory.length > MAX_HISTORY) newHistory.shift()
    historyRef.current = newHistory
    historyIndexRef.current = newHistory.length - 1
  }, [])

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)

    if (stateRef.current.cropMode) {
      const pos = getCanvasPos(e)
      cropStart.current = pos
      dispatch({ type: 'SET_CROP_RECT', rect: { x: pos.x, y: pos.y, w: 0, h: 0 } })
      return
    }

    saveHistory()
    isDrawing.current = true
    const pos = getCanvasPos(e)
    lastPos.current = pos

    // Draw a dot on tap/click (no movement needed)
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (ctx) {
      const { color, brushSize } = stateRef.current
      ctx.save()
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, brushSize / 2, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.restore()
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (stateRef.current.cropMode) {
      if (!cropStart.current) return
      const pos = getCanvasPos(e)
      const x = Math.min(cropStart.current.x, pos.x)
      const y = Math.min(cropStart.current.y, pos.y)
      const w = Math.abs(pos.x - cropStart.current.x)
      const h = Math.abs(pos.y - cropStart.current.y)
      dispatch({ type: 'SET_CROP_RECT', rect: { x, y, w, h } })
      return
    }

    if (!isDrawing.current || !lastPos.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { color, brushSize } = stateRef.current
    const pos = getCanvasPos(e)

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.globalCompositeOperation = 'source-over'
    ctx.lineWidth = brushSize
    ctx.strokeStyle = color
    ctx.stroke()
    ctx.restore()
    lastPos.current = pos
  }

  const handlePointerUp = () => {
    cropStart.current = null
    isDrawing.current = false
    lastPos.current = null
  }

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return
    historyIndexRef.current--
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.putImageData(historyRef.current[historyIndexRef.current], 0, 0)
  }, [])

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return
    historyIndexRef.current++
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.putImageData(historyRef.current[historyIndexRef.current], 0, 0)
  }, [])

  const clear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    saveHistory()
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stateRef.current.cropMode) {
        dispatch({ type: 'TOGGLE_CROP_MODE' })
        return
      }
      const meta = e.metaKey || e.ctrlKey
      if (!meta) return
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if (e.key === 'z' && e.shiftKey) { e.preventDefault(); redo() }
      if (e.key === 'y') { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [undo, redo])

  const getCropCanvas = (): HTMLCanvasElement => {
    const canvas = canvasRef.current!
    const rect = state.cropRect
    if (!rect || rect.w < 2 || rect.h < 2) return canvas
    const ctx = canvas.getContext('2d')!
    const cropped = ctx.getImageData(rect.x, rect.y, rect.w, rect.h)
    const tmp = document.createElement('canvas')
    tmp.width = rect.w
    tmp.height = rect.h
    tmp.getContext('2d')!.putImageData(cropped, 0, 0)
    return tmp
  }

  const download = (format: 'png' | 'jpeg' | 'webp') => {
    const src = (state.cropMode && state.cropRect) ? getCropCanvas() : canvasRef.current!
    const mime = `image/${format}`
    const url = src.toDataURL(mime)
    const a = document.createElement('a')
    a.href = url
    a.download = `drawing.${format === 'jpeg' ? 'jpg' : format}`
    a.click()
  }

  const copyPng = () => {
    const src = (state.cropMode && state.cropRect) ? getCropCanvas() : canvasRef.current!
    src.toBlob((blob) => {
      if (!blob) return
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        .then(() => {
          dispatch({ type: 'SET_COPIED', copied: true })
          if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
          copiedTimerRef.current = setTimeout(() => {
            dispatch({ type: 'SET_COPIED', copied: false })
          }, 1200)
        })
    }, 'image/png')
  }

  const r = Math.max(2, Math.round((state.brushSize * 0.45) / 2))
  const d = r * 2
  const cursorSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='${d}' height='${d}'><circle cx='${r}' cy='${r}' r='${r}' fill='black'/></svg>`
  const canvasCursor = state.cropMode
    ? 'crosshair'
    : `url("data:image/svg+xml,${encodeURIComponent(cursorSvg)}") ${r} ${r}, crosshair`

  return (
    <div className={styles.app}>
      <AppHeader title="draw" />

      <div className={styles.toolbar}>
        <div className={styles.toolbarRow}>
          <div className={styles.swatchGroup}>
            {SWATCHES.map((hex, i) => (
              <button
                key={hex}
                className={[
                  styles.swatch,
                  state.color === hex ? styles.swatchActive : '',
                  [3, 5, 7].includes(i) ? styles.swatchHideLarge : '',
                  i === 6 ? styles.swatchHideMedium : '',
                  [2, 4].includes(i) ? styles.swatchHideSmall : '',
                ].filter(Boolean).join(' ')}
                style={{ background: hex }}
                onClick={() => dispatch({ type: 'SET_COLOR', color: hex })}
                aria-label={hex}
              />
            ))}

            <div className={[styles.swatchDivider, styles.swatchHideSmall].join(' ')} />

            <div className={styles.colorPickerWrap}>
              <button
                className={[styles.swatch, styles.swatchWheel].join(' ')}
                aria-label="Pick custom color"
                onClick={() => {
                  const input = document.getElementById('colorPicker') as HTMLInputElement
                  input?.click()
                }}
              />
              <input
                id="colorPicker"
                type="color"
                className={styles.colorInput}
                value={state.color}
                onChange={(e) => dispatch({ type: 'SET_COLOR', color: e.target.value })}
                onBlur={(e) => dispatch({ type: 'ADD_RECENT_COLOR', color: e.target.value })}
              />
            </div>

            {state.recentColors[0] && (
              <button
                className={[
                  styles.swatch,
                  state.color === state.recentColors[0] ? styles.swatchActive : '',
                ].filter(Boolean).join(' ')}
                style={{ background: state.recentColors[0] }}
                aria-label={state.recentColors[0]}
                onClick={() => dispatch({ type: 'SET_COLOR', color: state.recentColors[0] })}
              />
            )}
          </div>

          <div className={styles.sizePresets}>
            {SIZE_PRESETS.map(([size, vr]) => (
              <button
                key={size}
                className={[styles.sizeDot, state.brushSize === size ? styles.sizeDotActive : ''].filter(Boolean).join(' ')}
                onClick={() => dispatch({ type: 'SET_BRUSH_SIZE', size })}
                title={`Size ${size}`}
                aria-label={`Brush size ${size}`}
              >
                <svg width="16" height="16" viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r={vr} fill="currentColor" />
                </svg>
              </button>
            ))}
          </div>

          <label className={styles.sizeGroup}>
            <span className={styles.label}>size</span>
            <DragNumber
              value={state.brushSize}
              min={1}
              max={100}
              pixelsPerUnit={1}
              className={styles.sizeInput}
              onChange={(v) => dispatch({ type: 'SET_BRUSH_SIZE', size: v })}
            />
          </label>
        </div>

        <div className={styles.toolbarRowGrid}>
          <div className={styles.historyGroup}>
            <button className={styles.toolBtn} onClick={undo} title="Undo (Cmd+Z)">undo</button>
            <button className={styles.toolBtn} onClick={redo} title="Redo (Cmd+Shift+Z)">redo</button>
            <button className={styles.toolBtn} onClick={clear}>clear</button>
          </div>
          <div className={styles.canvasSizeGroup}>
            <DragNumber
              value={state.canvasW}
              min={200}
              max={1240}
              step={10}
              pixelsPerUnit={1}
              className={styles.canvasSizeInput}
              onChange={(v) => dispatch({ type: 'SET_CANVAS_W', w: v })}
              onCommit={(v) => commitResize(v, state.canvasH)}
            />
            <span className={styles.label}>×</span>
            <DragNumber
              value={state.canvasH}
              min={200}
              max={2000}
              step={10}
              pixelsPerUnit={1}
              className={styles.canvasSizeInput}
              onChange={(v) => dispatch({ type: 'SET_CANVAS_H', h: v })}
              onCommit={(v) => commitResize(state.canvasW, v)}
            />
          </div>
          <div className={styles.cropCol}>
            <button
              className={[styles.toolBtnIcon, state.cropMode ? styles.active : ''].filter(Boolean).join(' ')}
              onClick={() => dispatch({ type: 'TOGGLE_CROP_MODE' })}
              title="Crop"
              aria-label="Crop"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <polyline points="8.5,1 12,1 12,4.5" />
                <polyline points="4.5,12 1,12 1,8.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div
        className={styles.canvasWrap}
        style={{ width: `${Math.min(100, (state.canvasW / 1240) * 100)}%`, margin: '0 auto' }}
      >
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          style={{ cursor: canvasCursor, aspectRatio: `${state.canvasW} / ${state.canvasH}` }}
          width={actualDimsRef.current.w}
          height={actualDimsRef.current.h}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        <canvas
          ref={overlayRef}
          className={styles.overlay}
          width={actualDimsRef.current.w}
          height={actualDimsRef.current.h}
          style={{ pointerEvents: 'none' }}
        />
        <div
          className={styles.resizeHandle}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          onPointerCancel={handleResizePointerUp}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <circle cx="8.5" cy="8.5" r="1.2"/>
            <circle cx="4.5" cy="8.5" r="1.2"/>
            <circle cx="8.5" cy="4.5" r="1.2"/>
          </svg>
        </div>
      </div>

      <div className={styles.exportRow}>
        <ActionButton onClick={() => download('png')}>png</ActionButton>
        <ActionButton onClick={() => download('jpeg')}>jpg</ActionButton>
        <ActionButton onClick={() => download('webp')}>webp</ActionButton>
        <div style={{ flex: 1 }} />
        <ActionButton onClick={copyPng}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="3" width="7" height="8" rx="1"/>
            <path d="M9 3V2a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h1"/>
          </svg>
          <span className={styles.copyLabel}>png</span>
        </ActionButton>
      </div>

      <StatusMessage message="copied!" visible={state.copied} />
    </div>
  )
}
