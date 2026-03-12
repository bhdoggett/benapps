import { useRef, useEffect } from 'react'
import type { RefObject } from 'react'
import styles from './ImageApp.module.css'
import type { CropRegion } from './imageTransforms'

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
type Box = { x: number; y: number; w: number; h: number }
type DragMode =
  | null
  | { kind: 'draw'; startX: number; startY: number }
  | { kind: 'move'; startX: number; startY: number; origBox: Box }
  | { kind: 'resize'; handle: Handle; startX: number; startY: number; origBox: Box }

type Props = {
  imgRef: RefObject<HTMLImageElement | null>
  naturalWidth: number
  naturalHeight: number
  initialRegion: CropRegion | null
  onCrop: (region: CropRegion) => void
}

const HANDLE_SIZE = 8
const HALF = HANDLE_SIZE / 2
const MIN_BOX = 10

function clampBox(b: Box, cw: number, ch: number): Box {
  const x = Math.max(0, Math.min(b.x, cw - b.w))
  const y = Math.max(0, Math.min(b.y, ch - b.h))
  const w = Math.min(b.w, cw - x)
  const h = Math.min(b.h, ch - y)
  return { x, y, w, h }
}

function handlePositions(box: Box): Record<Handle, { x: number; y: number }> {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  return {
    nw: { x: box.x,         y: box.y         },
    n:  { x: cx,            y: box.y         },
    ne: { x: box.x + box.w, y: box.y         },
    e:  { x: box.x + box.w, y: cy            },
    se: { x: box.x + box.w, y: box.y + box.h },
    s:  { x: cx,            y: box.y + box.h },
    sw: { x: box.x,         y: box.y + box.h },
    w:  { x: box.x,         y: cy            },
  }
}

function hitHandle(px: number, py: number, box: Box): Handle | null {
  for (const [h, pos] of Object.entries(handlePositions(box)) as [Handle, { x: number; y: number }][]) {
    if (px >= pos.x - HALF && px <= pos.x + HALF && py >= pos.y - HALF && py <= pos.y + HALF) return h
  }
  return null
}

function hitInterior(px: number, py: number, box: Box): boolean {
  return px > box.x + HALF && px < box.x + box.w - HALF &&
         py > box.y + HALF && py < box.y + box.h - HALF
}

const HANDLE_CURSOR: Record<Handle, string> = {
  nw: 'nw-resize', n: 'ns-resize', ne: 'ne-resize',
  e: 'ew-resize',  se: 'se-resize', s: 'ns-resize',
  sw: 'sw-resize', w: 'ew-resize',
}

export default function CropOverlay({ imgRef, naturalWidth, naturalHeight, initialRegion, onCrop }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<Box | null>(null)
  const dragRef = useRef<DragMode>(null)
  const canvasSizeRef = useRef({ w: 0, h: 0 })

  function draw() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const box = boxRef.current
    if (!box) return

    ctx.fillStyle = 'rgba(0,0,0,0.62)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.clearRect(box.x, box.y, box.w, box.h)

  }

  // Sync canvas size; scale boxRef proportionally on resize
  useEffect(() => {
    const img = imgRef.current
    if (!img) return

    function syncSize() {
      if (!canvasRef.current || !img) return
      const newW = img.clientWidth
      const newH = img.clientHeight
      const { w: oldW, h: oldH } = canvasSizeRef.current
      if (oldW > 0 && oldH > 0 && boxRef.current) {
        const b = boxRef.current
        boxRef.current = {
          x: b.x * newW / oldW,
          y: b.y * newH / oldH,
          w: b.w * newW / oldW,
          h: b.h * newH / oldH,
        }
      }
      canvasRef.current.width = newW
      canvasRef.current.height = newH
      canvasSizeRef.current = { w: newW, h: newH }
      draw()
    }

    syncSize()
    const observer = new ResizeObserver(syncSize)
    observer.observe(img)
    return () => observer.disconnect()
  }, [imgRef])

  // Sync initialRegion prop → boxRef (on mount and when region changes via preset)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!initialRegion) {
      boxRef.current = null
      draw()
      return
    }
    const { width: cw, height: ch } = canvas
    if (cw === 0 || ch === 0 || naturalWidth === 0 || naturalHeight === 0) return
    boxRef.current = {
      x: initialRegion.x * cw / naturalWidth,
      y: initialRegion.y * ch / naturalHeight,
      w: initialRegion.w * cw / naturalWidth,
      h: initialRegion.h * ch / naturalHeight,
    }
    draw()
  }, [initialRegion, naturalWidth, naturalHeight])

  function getPos(e: React.PointerEvent): { x: number; y: number } {
    const canvas = canvasRef.current!
    const r = canvas.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(e.clientX - r.left, canvas.width)),
      y: Math.max(0, Math.min(e.clientY - r.top, canvas.height)),
    }
  }

  function updateCursor(px: number, py: number) {
    const canvas = canvasRef.current!
    const box = boxRef.current
    if (!box) { canvas.style.cursor = 'crosshair'; return }
    const h = hitHandle(px, py, box)
    if (h) canvas.style.cursor = HANDLE_CURSOR[h]
    else if (hitInterior(px, py, box)) canvas.style.cursor = 'grab'
    else canvas.style.cursor = 'crosshair'
  }

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    const { x, y } = getPos(e)
    const box = boxRef.current

    if (box) {
      const h = hitHandle(x, y, box)
      if (h) { dragRef.current = { kind: 'resize', handle: h, startX: x, startY: y, origBox: { ...box } }; return }
      if (hitInterior(x, y, box)) {
        dragRef.current = { kind: 'move', startX: x, startY: y, origBox: { ...box } }
        ;(e.currentTarget as HTMLCanvasElement).style.cursor = 'grabbing'
        return
      }
    }

    dragRef.current = { kind: 'draw', startX: x, startY: y }
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    const { x, y } = getPos(e)

    if (!drag) { updateCursor(x, y); return }

    const canvas = canvasRef.current!
    const cw = canvas.width
    const ch = canvas.height
    const dx = x - drag.startX
    const dy = y - drag.startY

    if (drag.kind === 'draw') {
      boxRef.current = {
        x: Math.min(drag.startX, x),
        y: Math.min(drag.startY, y),
        w: Math.abs(dx),
        h: Math.abs(dy),
      }
    } else if (drag.kind === 'move') {
      boxRef.current = clampBox({ x: drag.origBox.x + dx, y: drag.origBox.y + dy, w: drag.origBox.w, h: drag.origBox.h }, cw, ch)
    } else {
      const ob = drag.origBox
      let { x: nx, y: ny, w: nw, h: nh } = ob

      switch (drag.handle) {
        case 'e':  nw = Math.max(MIN_BOX, ob.w + dx); break
        case 'w':  nw = Math.max(MIN_BOX, ob.w - dx); nx = ob.x + ob.w - nw; break
        case 's':  nh = Math.max(MIN_BOX, ob.h + dy); break
        case 'n':  nh = Math.max(MIN_BOX, ob.h - dy); ny = ob.y + ob.h - nh; break
        case 'se': nw = Math.max(MIN_BOX, ob.w + dx); nh = Math.max(MIN_BOX, ob.h + dy); break
        case 'sw': nw = Math.max(MIN_BOX, ob.w - dx); nx = ob.x + ob.w - nw; nh = Math.max(MIN_BOX, ob.h + dy); break
        case 'ne': nw = Math.max(MIN_BOX, ob.w + dx); nh = Math.max(MIN_BOX, ob.h - dy); ny = ob.y + ob.h - nh; break
        case 'nw': nw = Math.max(MIN_BOX, ob.w - dx); nx = ob.x + ob.w - nw; nh = Math.max(MIN_BOX, ob.h - dy); ny = ob.y + ob.h - nh; break
      }

      boxRef.current = clampBox({ x: nx, y: ny, w: nw, h: nh }, cw, ch)
    }

    draw()
  }

  function onPointerUp(e: React.PointerEvent) {
    const drag = dragRef.current
    dragRef.current = null
    const { x, y } = getPos(e)

    const canvas = canvasRef.current
    const box = boxRef.current

    if (drag?.kind === 'draw' && box && (box.w <= 5 || box.h <= 5)) {
      boxRef.current = null
      draw()
    } else if (box && canvas && box.w > 5 && box.h > 5) {
      draw()
      const scaleX = naturalWidth / canvas.width
      const scaleY = naturalHeight / canvas.height
      onCrop({
        x: Math.round(box.x * scaleX),
        y: Math.round(box.y * scaleY),
        w: Math.round(box.w * scaleX),
        h: Math.round(box.h * scaleY),
      })
    }

    updateCursor(x, y)
  }

  return (
    <canvas
      ref={canvasRef}
      className={styles.cropOverlay}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  )
}
