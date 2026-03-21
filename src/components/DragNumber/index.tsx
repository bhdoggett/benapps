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
  const dragRef = useRef<{ startY: number; startVal: number } | null>(null)

  useEffect(() => {
    if (!dragRef.current) setText(String(value))
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
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        dragRef.current = { startY: e.clientY, startVal: value }
      }}
      onPointerMove={(e) => {
        if (!dragRef.current) return
        const delta = Math.round((dragRef.current.startY - e.clientY) / pixelsPerUnit) * step
        const newVal = Math.max(min, Math.min(max, dragRef.current.startVal + delta))
        onChange(newVal)
        setText(String(newVal))
      }}
      onPointerUp={() => { dragRef.current = null }}
    />
  )
}
