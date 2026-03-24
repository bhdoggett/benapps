import { useEffect, useReducer, useRef, useCallback } from 'react'
import AppHeader from '../../components/AppHeader'
import ActionButton from '../../components/ActionButton'
import DragNumber from '../../components/DragNumber'
import StatusMessage from '../../components/StatusMessage'
import styles from './DrawApp.module.css'

type Tool = 'pencil' | 'eraser'

type CropRect = { x: number; y: number; w: number; h: number }

type State = {
  tool: Tool
  color: string
  brushSize: number
  eraserSize: number
  copied: boolean
  recentColors: string[]
  cropMode: boolean
  cropRect: CropRect | null
}

type Action =
  | { type: 'SET_TOOL'; tool: Tool }
  | { type: 'SET_COLOR'; color: string }
  | { type: 'SET_BRUSH_SIZE'; size: number }
  | { type: 'SET_ERASER_SIZE'; size: number }
  | { type: 'SET_COPIED'; copied: boolean }
  | { type: 'ADD_RECENT_COLOR'; color: string }
  | { type: 'TOGGLE_CROP_MODE' }
  | { type: 'SET_CROP_RECT'; rect: CropRect | null }

const initial: State = {
  tool: 'pencil',
  color: '#000000',
  brushSize: 4,
  eraserSize: 20,
  copied: false,
  recentColors: [],
  cropMode: false,
  cropRect: null,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_TOOL': return { ...state, tool: action.tool }
    case 'SET_COLOR': return { ...state, color: action.color }
    case 'SET_BRUSH_SIZE': return { ...state, brushSize: action.size }
    case 'SET_ERASER_SIZE': return { ...state, eraserSize: action.size }
    case 'SET_COPIED': return { ...state, copied: action.copied }
    case 'ADD_RECENT_COLOR': {
      const filtered = state.recentColors.filter(c => c !== action.color)
      return { ...state, recentColors: [action.color, ...filtered].slice(0, 1) }
    }
    case 'TOGGLE_CROP_MODE':
      return { ...state, cropMode: !state.cropMode, cropRect: null }
    case 'SET_CROP_RECT':
      return { ...state, cropRect: action.rect }
  }
}

const SWATCHES = [
  '#000000', '#ffffff', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#3b82f6', '#a855f7',
]

const MAX_HISTORY = 30
const CANVAS_W = 1240
const CANVAS_H = 840

export default function DrawApp() {
  const [state, dispatch] = useReducer(reducer, initial)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)
  const cropStart = useRef<{ x: number; y: number } | null>(null)
  const historyRef = useRef<ImageData[]>([])
  const historyIndexRef = useRef(-1)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    historyRef.current = [ctx.getImageData(0, 0, canvas.width, canvas.height)]
    historyIndexRef.current = 0
  }, [])

  // Draw crop overlay
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    const ctx = overlay.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

    const rect = state.cropRect
    if (!rect || !state.cropMode) return

    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
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
      x: Math.round((e.clientX - rect.left) * (CANVAS_W / rect.width)),
      y: Math.round((e.clientY - rect.top) * (CANVAS_H / rect.height)),
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
    lastPos.current = getCanvasPos(e)
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

    const { tool, color, brushSize, eraserSize } = stateRef.current
    const pos = getCanvasPos(e)

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.lineWidth = eraserSize
      ctx.strokeStyle = 'rgba(0,0,0,1)'
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.lineWidth = brushSize
      ctx.strokeStyle = color
    }

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

  // Build a canvas containing only the cropped region (for export)
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

  const selectColor = (hex: string) => {
    dispatch({ type: 'SET_COLOR', color: hex })
    dispatch({ type: 'SET_TOOL', tool: 'pencil' })
  }

  const activeSize = state.tool === 'eraser' ? state.eraserSize : state.brushSize

  const canvasCursor = (() => {
    if (state.cropMode) return 'crosshair'
    const scale = 0.45
    if (state.tool === 'pencil') {
      const r = Math.max(2, Math.round((state.brushSize * scale) / 2))
      const d = r * 2
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${d}' height='${d}'><circle cx='${r}' cy='${r}' r='${r}' fill='black'/></svg>`
      return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${r} ${r}, crosshair`
    } else {
      const r = Math.max(3, Math.round((state.eraserSize * scale) / 2))
      const d = r * 2
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${d}' height='${d}'><circle cx='${r}' cy='${r}' r='${r - 1}' fill='white' stroke='black' stroke-width='1'/></svg>`
      return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${r} ${r}, cell`
    }
  })()

  return (
    <div className={styles.app}>
      <AppHeader title="draw" />

      <div className={styles.toolbar}>
        <div className={styles.toolbarRow}>
        <div className={styles.toolGroup}>
          <button
            className={[styles.toolBtn, state.tool === 'pencil' ? styles.active : ''].filter(Boolean).join(' ')}
            onClick={() => dispatch({ type: 'SET_TOOL', tool: 'pencil' })}
          >
            pencil
          </button>
          <button
            className={[styles.toolBtn, state.tool === 'eraser' ? styles.active : ''].filter(Boolean).join(' ')}
            onClick={() => dispatch({ type: 'SET_TOOL', tool: 'eraser' })}
          >
            eraser
          </button>
        </div>

        <div className={styles.swatchGroup}>
          {SWATCHES.map((hex, i) => (
            <button
              key={hex}
              className={[
                styles.swatch,
                state.color === hex && state.tool === 'pencil' ? styles.swatchActive : '',
                // orange(3), green(5), blue(6), purple(7) hidden ≤375px
                [3, 5, 6, 7].includes(i) ? styles.swatchHideMedium : '',
                // red(2), yellow(4) hidden ≤320px
                [2, 4].includes(i) ? styles.swatchHideSmall : '',
              ].filter(Boolean).join(' ')}
              style={{ background: hex }}
              onClick={() => selectColor(hex)}
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
              onChange={(e) => selectColor(e.target.value)}
              onBlur={(e) => dispatch({ type: 'ADD_RECENT_COLOR', color: e.target.value })}
            />
          </div>

          {state.recentColors[0] && (
            <button
              className={[
                styles.swatch,
                state.color === state.recentColors[0] && state.tool === 'pencil' ? styles.swatchActive : '',
              ].filter(Boolean).join(' ')}
              style={{ background: state.recentColors[0] }}
              aria-label={state.recentColors[0]}
              onClick={() => selectColor(state.recentColors[0])}
            />
          )}
        </div>

        <label className={styles.sizeGroup}>
          <span className={styles.label}>size</span>
          <DragNumber
            value={activeSize}
            min={1}
            max={40}
            pixelsPerUnit={1}
            className={styles.sizeInput}
            onChange={(v) => {
              if (state.tool === 'eraser') {
                dispatch({ type: 'SET_ERASER_SIZE', size: v })
              } else {
                dispatch({ type: 'SET_BRUSH_SIZE', size: v })
              }
            }}
          />
        </label>
        </div>

        <div className={styles.toolbarRow}>
        <div className={styles.historyGroup}>
          <button className={styles.toolBtn} onClick={undo} title="Undo (Cmd+Z)">undo</button>
          <button className={styles.toolBtn} onClick={redo} title="Redo (Cmd+Shift+Z)">redo</button>
          <button className={styles.toolBtn} onClick={clear}>clear</button>
        </div>
        <button
          className={[styles.toolBtnIcon, state.cropMode ? styles.active : ''].filter(Boolean).join(' ')}
          style={{ marginLeft: 'auto' }}
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

      <div className={styles.canvasWrap}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          style={{ cursor: canvasCursor }}
          width={CANVAS_W}
          height={CANVAS_H}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        <canvas
          ref={overlayRef}
          className={styles.overlay}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{ pointerEvents: 'none' }}
        />
      </div>

      <div className={styles.exportRow}>
        <ActionButton onClick={() => download('png')}>png</ActionButton>
        <ActionButton onClick={() => download('jpeg')}>jpg</ActionButton>
        <ActionButton onClick={() => download('webp')}>webp</ActionButton>
        <ActionButton onClick={copyPng}>copy png</ActionButton>
      </div>

      <StatusMessage message="copied!" visible={state.copied} />
    </div>
  )
}
