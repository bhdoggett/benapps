import { useState } from 'react'
import BackLink from '../../components/BackLink'
import AppHeader from '../../components/AppHeader'
import DropZone from '../../components/DropZone'
import ActionButton from '../../components/ActionButton'
import ConvertButton from '../../components/ConvertButton'
import styles from './ImageApp.module.css'

type ImageState = {
  img: HTMLImageElement
  name: string
  info: string
}

export default function ImageApp() {
  const [current, setCurrent] = useState<ImageState | null>(null)
  const [error, setError] = useState('')

  function loadFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('unsupported file type — try exporting as jpg or png first')
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      setError('')
      setCurrent({
        img,
        name: file.name.replace(/\.[^.]+$/, ''),
        info: `${file.name}  ·  ${img.naturalWidth} × ${img.naturalHeight}`,
      })
    }
    img.onerror = () => setError('could not load image — unsupported format')
    img.src = url
  }

  function convert(format: string) {
    if (!current) return
    const ext = format === 'jpeg' ? 'jpg' : format
    const canvas = document.createElement('canvas')
    canvas.width = current.img.naturalWidth
    canvas.height = current.img.naturalHeight
    const ctx = canvas.getContext('2d')!
    if (format === 'jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(current.img, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${current.name}.${ext}`
      a.click()
      URL.revokeObjectURL(a.href)
    }, `image/${format}`)
  }

  function reset() {
    setCurrent(null)
    setError('')
  }

  return (
    <div className={styles.app}>
      <BackLink />
      <AppHeader title="image" />
      {!current && <DropZone accept="image/*" onFile={loadFile} label="drop image here" />}
      {error && <p className={styles.errorMsg}>{error}</p>}
      {current && (
        <>
          <div className={styles.previewWrap}>
            <img className={styles.preview} src={current.img.src} alt="" />
          </div>
          <div className={styles.fileMeta}>
            <span className={styles.fileInfo}>{current.info}</span>
            <ActionButton onClick={reset} muted>reset</ActionButton>
          </div>
          <div className={styles.convertRow}>
            <ConvertButton format="png" label="png" onClick={() => convert('png')} />
            <ConvertButton format="jpeg" label="jpg" onClick={() => convert('jpeg')} />
            <ConvertButton format="webp" label="webp" onClick={() => convert('webp')} />
          </div>
        </>
      )}
    </div>
  )
}
