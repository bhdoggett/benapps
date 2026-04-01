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
