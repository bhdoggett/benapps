import { useReducer, useRef } from 'react'
import type { CSSProperties } from 'react'
import BackLink from '../../components/BackLink'
import AppHeader from '../../components/AppHeader'
import DropZone from '../../components/DropZone'
import ActionButton from '../../components/ActionButton'
import ConvertButton from '../../components/ConvertButton'
import CropOverlay from './CropOverlay'
import { applyTransforms, defaultTransforms } from './imageTransforms'
import type { TransformState, CropRegion } from './imageTransforms'

function squareCrop(w: number, h: number): CropRegion {
  const side = Math.min(w, h)
  return { x: Math.round((w - side) / 2), y: Math.round((h - side) / 2), w: side, h: side }
}

function widescreen(w: number, h: number): CropRegion {
  let cropW = w, cropH = Math.round(w * 9 / 16)
  if (cropH > h) { cropH = h; cropW = Math.round(h * 16 / 9) }
  return { x: Math.round((w - cropW) / 2), y: Math.round((h - cropH) / 2), w: cropW, h: cropH }
}
import styles from './ImageApp.module.css'

type ImageState = {
  img: HTMLImageElement
  name: string
  info: string
}

type State = {
  current: ImageState | null
  transforms: TransformState
  error: string
  cropActive: boolean
}

type Action =
  | { type: 'LOAD'; current: ImageState }
  | { type: 'LOAD_ERROR'; msg: string }
  | { type: 'TOGGLE_FLIP_H' }
  | { type: 'TOGGLE_FLIP_V' }
  | { type: 'ROTATE_CW' }
  | { type: 'TOGGLE_GREYSCALE' }
  | { type: 'SET_BRIGHTNESS'; value: number }
  | { type: 'TOGGLE_CROP' }
  | { type: 'SET_CROP'; region: CropRegion }
  | { type: 'CLEAR_CROP' }
  | { type: 'RESET' }

const initial: State = {
  current: null,
  transforms: defaultTransforms,
  error: '',
  cropActive: false,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOAD':
      return { ...initial, current: action.current }
    case 'LOAD_ERROR':
      return { ...state, error: action.msg }
    case 'TOGGLE_FLIP_H':
      return { ...state, transforms: { ...state.transforms, flipH: !state.transforms.flipH } }
    case 'TOGGLE_FLIP_V':
      return { ...state, transforms: { ...state.transforms, flipV: !state.transforms.flipV } }
    case 'ROTATE_CW':
      return { ...state, transforms: { ...state.transforms, rotation: (state.transforms.rotation + 90) % 360 } }
    case 'TOGGLE_GREYSCALE':
      return { ...state, transforms: { ...state.transforms, greyscale: !state.transforms.greyscale } }
    case 'SET_BRIGHTNESS':
      return { ...state, transforms: { ...state.transforms, brightness: action.value } }
    case 'TOGGLE_CROP':
      return { ...state, cropActive: !state.cropActive }
    case 'SET_CROP':
      return { ...state, transforms: { ...state.transforms, crop: action.region } }
    case 'CLEAR_CROP':
      return { ...state, transforms: { ...state.transforms, crop: null }, cropActive: false }
    case 'RESET':
      return { ...initial }
    default:
      return state
  }
}

function previewStyle(t: TransformState): CSSProperties {
  const filters: string[] = []
  if (t.greyscale) filters.push('grayscale(1)')
  if (t.brightness !== 0) filters.push(`brightness(${1 + t.brightness / 100})`)

  const cssTransforms: string[] = []
  if (t.rotation !== 0) cssTransforms.push(`rotate(${t.rotation}deg)`)
  if (t.flipH) cssTransforms.push('scaleX(-1)')
  if (t.flipV) cssTransforms.push('scaleY(-1)')

  const rotated = t.rotation === 90 || t.rotation === 270

  return {
    filter: filters.length > 0 ? filters.join(' ') : undefined,
    transform: cssTransforms.length > 0 ? cssTransforms.join(' ') : undefined,
    // When rotated 90/270, layout width becomes visual height — cap it at 360px
    maxWidth: rotated ? '360px' : undefined,
  }
}

export default function ImageApp() {
  const [state, dispatch] = useReducer(reducer, initial)
  const imgRef = useRef<HTMLImageElement>(null)

  function loadFile(file: File) {
    if (!file.type.startsWith('image/')) {
      dispatch({ type: 'LOAD_ERROR', msg: 'unsupported file type — try exporting as jpg or png first' })
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      dispatch({
        type: 'LOAD',
        current: {
          img,
          name: file.name.replace(/\.[^.]+$/, ''),
          info: `${file.name}  ·  ${img.naturalWidth} × ${img.naturalHeight}`,
        },
      })
    }
    img.onerror = () => dispatch({ type: 'LOAD_ERROR', msg: 'could not load image — unsupported format' })
    img.src = url
  }

  function convert(format: string) {
    if (!state.current) return
    const ext = format === 'jpeg' ? 'jpg' : format
    applyTransforms(state.current.img, state.transforms, format, (blob) => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${state.current!.name}.${ext}`
      a.click()
      URL.revokeObjectURL(a.href)
    })
  }

  const { current, transforms, error, cropActive } = state

  const toggleButtons: [string, () => void, boolean][] = [
    ['flip h', () => dispatch({ type: 'TOGGLE_FLIP_H' }), transforms.flipH],
    ['flip v', () => dispatch({ type: 'TOGGLE_FLIP_V' }), transforms.flipV],
    ['rotate', () => dispatch({ type: 'ROTATE_CW' }), transforms.rotation !== 0],
    ['greyscale', () => dispatch({ type: 'TOGGLE_GREYSCALE' }), transforms.greyscale],
  ]

  const brightnessLabel = transforms.brightness > 0
    ? `+${transforms.brightness}`
    : String(transforms.brightness)

  return (
    <div className={styles.app}>
      <BackLink />
      <AppHeader title="image" />
      {!current && <DropZone accept="image/*" onFile={loadFile} label="drop image here" />}
      {error && <p className={styles.errorMsg}>{error}</p>}
      {current && (
        <>
          <div className={styles.fileMeta}>
            <span className={styles.fileInfo}>{current.info}</span>
            <ActionButton onClick={() => dispatch({ type: 'RESET' })} muted>reset</ActionButton>
          </div>

          <div className={styles.previewWrap}>
            <div className={styles.imgWrap}>
              <img
                ref={imgRef}
                className={styles.preview}
                src={current.img.src}
                alt=""
                style={previewStyle(transforms)}
              />
              {cropActive && (
                <CropOverlay
                  imgRef={imgRef}
                  naturalWidth={current.img.naturalWidth}
                  naturalHeight={current.img.naturalHeight}
                  initialRegion={transforms.crop}
                  onCrop={(region) => dispatch({ type: 'SET_CROP', region })}
                />
              )}
            </div>
          </div>

          <div className={styles.transformRow}>
            {toggleButtons.map(([label, handler, active]) => (
              <button
                key={label}
                className={[styles.transformBtn, active ? styles.selected : ''].filter(Boolean).join(' ')}
                onClick={handler}
              >
                {label}
              </button>
            ))}
          </div>

          <div className={styles.brightnessRow}>
            <span className={styles.brightnessLabel}>brightness</span>
            <input
              type="range"
              className={styles.brightnessSlider}
              min={-50}
              max={50}
              value={transforms.brightness}
              onChange={(e) => dispatch({ type: 'SET_BRIGHTNESS', value: Number(e.target.value) })}
            />
            <span className={styles.brightnessValue}>{brightnessLabel}</span>
          </div>

          <div className={styles.cropRow}>
            <button
              className={[styles.transformBtn, cropActive ? styles.selected : ''].filter(Boolean).join(' ')}
              onClick={() => dispatch({ type: 'TOGGLE_CROP' })}
            >
              crop
            </button>
            {cropActive && (
              <>
                <button
                  className={styles.transformBtn}
                  onClick={() => dispatch({ type: 'SET_CROP', region: squareCrop(current.img.naturalWidth, current.img.naturalHeight) })}
                >
                  square
                </button>
                <button
                  className={styles.transformBtn}
                  onClick={() => dispatch({ type: 'SET_CROP', region: widescreen(current.img.naturalWidth, current.img.naturalHeight) })}
                >
                  16:9
                </button>
                {transforms.crop && (
                  <button
                    className={styles.transformBtn}
                    onClick={() => dispatch({ type: 'CLEAR_CROP' })}
                  >
                    clear crop
                  </button>
                )}
              </>
            )}
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
