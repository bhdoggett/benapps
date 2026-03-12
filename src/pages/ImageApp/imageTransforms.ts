export type CropRegion = { x: number; y: number; w: number; h: number }

export type TransformState = {
  flipH: boolean
  flipV: boolean
  rotation: number // 0 | 90 | 180 | 270
  greyscale: boolean
  brightness: number // -50 to +50
  crop: CropRegion | null
}

export const defaultTransforms: TransformState = {
  flipH: false,
  flipV: false,
  rotation: 0,
  greyscale: false,
  brightness: 0,
  crop: null,
}

export function applyTransforms(
  img: HTMLImageElement,
  t: TransformState,
  format: string,
  onBlob: (blob: Blob) => void,
) {
  const srcX = t.crop ? t.crop.x : 0
  const srcY = t.crop ? t.crop.y : 0
  const srcW = t.crop ? t.crop.w : img.naturalWidth
  const srcH = t.crop ? t.crop.h : img.naturalHeight

  const rotated = t.rotation === 90 || t.rotation === 270
  const outW = rotated ? srcH : srcW
  const outH = rotated ? srcW : srcH

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')!

  if (format === 'jpeg') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  const filters: string[] = []
  if (t.greyscale) filters.push('grayscale(1)')
  if (t.brightness !== 0) filters.push(`brightness(${1 + t.brightness / 100})`)
  ctx.filter = filters.length > 0 ? filters.join(' ') : 'none'

  ctx.save()
  ctx.translate(outW / 2, outH / 2)
  ctx.rotate((t.rotation * Math.PI) / 180)
  if (t.flipH) ctx.scale(-1, 1)
  if (t.flipV) ctx.scale(1, -1)
  ctx.drawImage(img, srcX, srcY, srcW, srcH, -srcW / 2, -srcH / 2, srcW, srcH)
  ctx.restore()

  canvas.toBlob((blob) => {
    if (blob) onBlob(blob)
  }, `image/${format}`)
}
