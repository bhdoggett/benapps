export type CropRegion = { x: number; y: number; w: number; h: number }

export type TransformState = {
  // positional
  flipH: boolean
  flipV: boolean
  rotation: number // 0 | 90 | 180 | 270
  crop: CropRegion | null
  // filter toggles
  greyscale: boolean
  sepia: boolean
  invert: boolean
  // filter adjustments
  brightness: number // -50 to +50
  contrast: number   // -50 to +50
  saturate: number   // -50 to +50
  hueRotate: number  // -180 to 180
  blur: number       // 0 to 20
}

export const defaultTransforms: TransformState = {
  flipH: false,
  flipV: false,
  rotation: 0,
  crop: null,
  greyscale: false,
  sepia: false,
  invert: false,
  brightness: 0,
  contrast: 0,
  saturate: 0,
  hueRotate: 0,
  blur: 0,
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
  if (t.sepia) filters.push('sepia(1)')
  if (t.invert) filters.push('invert(1)')
  if (t.brightness !== 0) filters.push(`brightness(${1 + t.brightness / 100})`)
  if (t.contrast !== 0) filters.push(`contrast(${1 + t.contrast / 100})`)
  if (t.saturate !== 0) filters.push(`saturate(${1 + t.saturate / 100})`)
  if (t.hueRotate !== 0) filters.push(`hue-rotate(${t.hueRotate}deg)`)
  if (t.blur !== 0) filters.push(`blur(${t.blur}px)`)
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

export function exportAsPdf(img: HTMLImageElement, t: TransformState, filename: string) {
  applyTransforms(img, t, 'jpeg', (blob) => {
    void blob.arrayBuffer().then((buffer) => {
      const jpegBytes = new Uint8Array(buffer)
      const srcW = t.crop ? t.crop.w : img.naturalWidth
      const srcH = t.crop ? t.crop.h : img.naturalHeight
      const rotated = t.rotation === 90 || t.rotation === 270
      const w = rotated ? srcH : srcW
      const h = rotated ? srcW : srcH
      downloadPdf(w, h, jpegBytes, filename)
    })
  })
}

function downloadPdf(w: number, h: number, jpegBytes: Uint8Array, filename: string) {
  const enc = new TextEncoder()

  const csBytes = enc.encode(`q ${w} 0 0 ${h} 0 0 cm /Im Do Q`)
  const o1 = enc.encode(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`)
  const o2 = enc.encode(`2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`)
  const o3 = enc.encode(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Contents 4 0 R /Resources << /XObject << /Im 5 0 R >> >> >>\nendobj\n`)
  const o4h = enc.encode(`4 0 obj\n<< /Length ${csBytes.length} >>\nstream\n`)
  const o4f = enc.encode(`\nendstream\nendobj\n`)
  const o5h = enc.encode(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`)
  const o5f = enc.encode(`\nendstream\nendobj\n`)
  const hdr = enc.encode(`%PDF-1.4\n`)

  let off = hdr.length
  const offs: number[] = []
  offs.push(off); off += o1.length
  offs.push(off); off += o2.length
  offs.push(off); off += o3.length
  offs.push(off); off += o4h.length + csBytes.length + o4f.length
  offs.push(off); off += o5h.length + jpegBytes.length + o5f.length

  const xrefOff = off
  const xref = enc.encode(
    `xref\n0 6\n0000000000 65535 f \n` +
    offs.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  )
  const trailer = enc.encode(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOff}\n%%EOF`)

  const parts = [hdr, o1, o2, o3, o4h, csBytes, o4f, o5h, jpegBytes, o5f, xref, trailer]
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0))
  let pos = 0
  for (const p of parts) { out.set(p, pos); pos += p.length }

  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([out], { type: 'application/pdf' }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
