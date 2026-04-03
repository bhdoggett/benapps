export function downloadCanvas(
  canvas: HTMLCanvasElement,
  format: 'png' | 'jpeg' | 'webp',
  filename: string,
): void {
  const url = canvas.toDataURL(`image/${format}`)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.${format === 'jpeg' ? 'jpg' : format}`
  a.click()
}
