import { useEffect, useRef, useState } from 'react'
import styles from './DragNumber.module.css'

interface Props {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  className?: string
  pixelsPerUnit?: number
  step?: number
}

export default function DragNumber({
  value,
  min,
  max,
  onChange,
  className,
  pixelsPerUnit = 1.5,
  step = 1,
}: Props) {
  const [text, setText] = useState(String(value))
  const isDragging = useRef(false)

  useEffect(() => {
    if (!isDragging.current) setText(String(value))
  }, [value])

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={text}
      className={[styles.input, className].filter(Boolean).join(' ')}
      onChange={(e) => {
        setText(e.target.value)
        const n = Number(e.target.value)
        if (e.target.value !== '' && !isNaN(n)) {
          onChange(Math.max(min, Math.min(max, n)))
        }
      }}
      onBlur={() => setText(String(value))}
      onWheel={(e) => e.currentTarget.blur()}
      onPointerDown={(e) => {
        const startY = e.clientY
        const startVal = value

        const onMove = (ev: PointerEvent) => {
          if (!isDragging.current && Math.abs(ev.clientY - startY) < 3) return
          isDragging.current = true
          const delta = Math.round((startY - ev.clientY) / pixelsPerUnit) * step
          const newVal = Math.max(min, Math.min(max, startVal + delta))
          onChange(newVal)
          setText(String(newVal))
        }

        const onUp = () => {
          isDragging.current = false
          document.removeEventListener('pointermove', onMove)
          document.removeEventListener('pointerup', onUp)
          document.removeEventListener('pointercancel', onUp)
        }

        document.addEventListener('pointermove', onMove)
        document.addEventListener('pointerup', onUp)
        document.addEventListener('pointercancel', onUp)
      }}
    />
  )
}
