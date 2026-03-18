import { useReducer, useRef, useEffect } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import BackLink from '../../components/BackLink'
import RangeSlider from '../../components/RangeSlider'
import AppHeader from '../../components/AppHeader'
import DropZone from '../../components/DropZone'
import ConvertButton from '../../components/ConvertButton'
import CropOverlay from './CropOverlay'
import { applyTransforms, exportAsPdf, defaultTransforms, renderRemovedBg } from './imageTransforms'
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
  fileName: string
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
  | { type: 'TOGGLE_SEPIA' }
  | { type: 'TOGGLE_INVERT' }
  | { type: 'SET_BRIGHTNESS'; value: number }
  | { type: 'SET_CONTRAST'; value: number }
  | { type: 'SET_SATURATE'; value: number }
  | { type: 'SET_HUE_ROTATE'; value: number }
  | { type: 'SET_BLUR'; value: number }
  | { type: 'TOGGLE_CROP' }
  | { type: 'SET_CROP'; region: CropRegion }
  | { type: 'TOGGLE_REMOVE_BG' }
  | { type: 'SET_BG_TOLERANCE'; value: number }
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
    case 'TOGGLE_SEPIA':
      return { ...state, transforms: { ...state.transforms, sepia: !state.transforms.sepia } }
    case 'TOGGLE_INVERT':
      return { ...state, transforms: { ...state.transforms, invert: !state.transforms.invert } }
    case 'SET_BRIGHTNESS':
      return { ...state, transforms: { ...state.transforms, brightness: action.value } }
    case 'SET_CONTRAST':
      return { ...state, transforms: { ...state.transforms, contrast: action.value } }
    case 'SET_SATURATE':
      return { ...state, transforms: { ...state.transforms, saturate: action.value } }
    case 'SET_HUE_ROTATE':
      return { ...state, transforms: { ...state.transforms, hueRotate: action.value } }
    case 'SET_BLUR':
      return { ...state, transforms: { ...state.transforms, blur: action.value } }
    case 'TOGGLE_CROP':
      return { ...state, cropActive: !state.cropActive }
    case 'SET_CROP':
      return { ...state, transforms: { ...state.transforms, crop: action.region } }
    case 'TOGGLE_REMOVE_BG':
      return { ...state, transforms: { ...state.transforms, removeBg: !state.transforms.removeBg } }
    case 'SET_BG_TOLERANCE':
      return { ...state, transforms: { ...state.transforms, bgTolerance: action.value } }
    case 'RESET':
      return { ...initial }
    default:
      return state
  }
}

function cssFilterStr(t: TransformState): string | undefined {
  const filters: string[] = []
  if (t.greyscale) filters.push('grayscale(1)')
  if (t.sepia) filters.push('sepia(1)')
  if (t.invert) filters.push('invert(1)')
  if (t.brightness !== 0) filters.push(`brightness(${1 + t.brightness / 100})`)
  if (t.contrast !== 0) filters.push(`contrast(${1 + t.contrast / 100})`)
  if (t.saturate !== 0) filters.push(`saturate(${1 + t.saturate / 100})`)
  if (t.hueRotate !== 0) filters.push(`hue-rotate(${t.hueRotate}deg)`)
  if (t.blur !== 0) filters.push(`blur(${t.blur}px)`)
  return filters.length > 0 ? filters.join(' ') : undefined
}

function previewStyle(t: TransformState): CSSProperties {
  const cssTransforms: string[] = []
  if (t.rotation !== 0) cssTransforms.push(`rotate(${t.rotation}deg)`)
  if (t.flipH) cssTransforms.push('scaleX(-1)')
  if (t.flipV) cssTransforms.push('scaleY(-1)')

  const rotated = t.rotation === 90 || t.rotation === 270

  return {
    filter: cssFilterStr(t),
    transform: cssTransforms.length > 0 ? cssTransforms.join(' ') : undefined,
    // When rotated 90/270, layout width becomes visual height — cap it at 360px
    maxWidth: rotated ? '360px' : undefined,
  }
}

export default function ImageApp() {
const [state, dispatch] = useReducer(reducer, initial)
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!state.current || !state.transforms.removeBg) return
    const canvas = canvasRef.current
    if (!canvas) return
    const imageData = renderRemovedBg(state.current.img, state.transforms)
    canvas.width = imageData.width
    canvas.height = imageData.height
    canvas.getContext('2d')!.putImageData(imageData, 0, 0)
  }, [state.current, state.transforms])

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
          fileName: file.name,
        },
      })
    }
    img.onerror = () => dispatch({ type: 'LOAD_ERROR', msg: 'could not load image — unsupported format' })
    img.src = url
  }

  function convert(format: string) {
    if (!state.current) return
    if (format === 'pdf') {
      exportAsPdf(state.current.img, state.transforms, `${state.current.name}.pdf`)
      return
    }
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

  const positionalButtons: [ReactNode, () => void, boolean][] = [
    [
      <svg key="flipH" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="1" y1="8" x2="7" y2="8"/><polyline points="3.5,5.5 1,8 3.5,10.5"/>
        <line x1="9" y1="8" x2="15" y2="8"/><polyline points="12.5,5.5 15,8 12.5,10.5"/>
      </svg>,
      () => dispatch({ type: 'TOGGLE_FLIP_H' }), transforms.flipH,
    ],
    [
      <svg key="flipV" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="1" x2="8" y2="7"/><polyline points="5.5,3.5 8,1 10.5,3.5"/>
        <line x1="8" y1="9" x2="8" y2="15"/><polyline points="5.5,12.5 8,15 10.5,12.5"/>
      </svg>,
      () => dispatch({ type: 'TOGGLE_FLIP_V' }), transforms.flipV,
    ],
    [
      <svg key="rotate" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 8A5 5 0 1 1 10.5 3.4"/>
        <polyline points="9,1 13,3.5 11,7"/>
      </svg>,
      () => dispatch({ type: 'ROTATE_CW' }), transforms.rotation !== 0,
    ],
  ]

  const filterButtons: [string, () => void, boolean][] = [
    ['greyscale', () => dispatch({ type: 'TOGGLE_GREYSCALE' }), transforms.greyscale],
    ['sepia', () => dispatch({ type: 'TOGGLE_SEPIA' }), transforms.sepia],
    ['invert', () => dispatch({ type: 'TOGGLE_INVERT' }), transforms.invert],
  ]

  function signedLabel(v: number) { return v > 0 ? `+${v}` : String(v) }
  const sliders: [string, number, number, number, string, (v: number) => void][] = [
    ['brightness', transforms.brightness, -50, 50, signedLabel(transforms.brightness), (v) => dispatch({ type: 'SET_BRIGHTNESS', value: v })],
    ['contrast',   transforms.contrast,   -50, 50, signedLabel(transforms.contrast),   (v) => dispatch({ type: 'SET_CONTRAST',   value: v })],
    ['saturate',   transforms.saturate,   -50, 50, signedLabel(transforms.saturate),   (v) => dispatch({ type: 'SET_SATURATE',   value: v })],
    ['hue',        transforms.hueRotate, -180, 180, signedLabel(transforms.hueRotate),  (v) => dispatch({ type: 'SET_HUE_ROTATE', value: v })],
    ['blur',       transforms.blur,         0,  20, transforms.blur === 0 ? '0' : `${transforms.blur}px`, (v) => dispatch({ type: 'SET_BLUR', value: v })],
  ]

  return (
    <div className={styles.app}>
      <BackLink />
      <AppHeader title="image" />
      {!current && <DropZone accept="image/*" onFile={loadFile} label="drop image here" />}
      {error && <p className={styles.errorMsg}>{error}</p>}
      {current && (
        <>
          <div className={styles.fileMeta}>
            <div className={styles.fileInfo}>
              <span className={styles.fileName}>{current.fileName}</span>
              <span className={styles.fileDims}>&nbsp;·&nbsp;{current.img.naturalWidth}&nbsp;×&nbsp;{current.img.naturalHeight}</span>
            </div>
            <button className={styles.closeBtn} onClick={() => dispatch({ type: 'RESET' })}>×</button>
          </div>

          <div className={styles.previewWrap}>
            <div className={styles.imgWrap}>
              {transforms.removeBg ? (
                <canvas ref={canvasRef} className={styles.bgCanvas} style={{ filter: cssFilterStr(transforms) }} />
              ) : (
                <>
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
                </>
              )}
            </div>
          </div>

          <div className={styles.transformRow}>
            {positionalButtons.map(([icon, handler, active], i) => (
              <button
                key={i}
                className={[styles.transformBtn, styles.iconBtn, active ? styles.selected : ''].filter(Boolean).join(' ')}
                onClick={handler}
              >
                {icon}
              </button>
            ))}
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
              </>
            )}
          </div>

          <div className={styles.transformRow}>
            {filterButtons.map(([label, handler, active]) => (
              <button
                key={label}
                className={[styles.transformBtn, active ? styles.selected : ''].filter(Boolean).join(' ')}
                onClick={handler}
              >
                {label}
              </button>
            ))}
          </div>

          {sliders.map(([label, value, min, max, display, onChange]) => (
            <div key={label} className={styles.sliderRow}>
              <span className={styles.sliderLabel}>{label}</span>
              <RangeSlider min={min} max={max} value={value} onChange={onChange} />
              <span className={styles.sliderValue}>{display}</span>
            </div>
          ))}

          <div className={styles.sliderRow}>
            <button
              className={[styles.transformBtn, transforms.removeBg ? styles.selected : ''].filter(Boolean).join(' ')}
              onClick={() => dispatch({ type: 'TOGGLE_REMOVE_BG' })}
            >
              remove bg
            </button>
            <RangeSlider min={0} max={100} value={transforms.bgTolerance} onChange={(v) => dispatch({ type: 'SET_BG_TOLERANCE', value: v })} />
            <span className={styles.sliderValue}>{transforms.bgTolerance}</span>
          </div>

          <div className={styles.convertRow}>
            <ConvertButton format="png" label="png" onClick={() => convert('png')} />
            <ConvertButton format="jpeg" label="jpg" onClick={() => convert('jpeg')} />
            <ConvertButton format="webp" label="webp" onClick={() => convert('webp')} />
            <ConvertButton format="pdf" label="pdf" onClick={() => convert('pdf')} />
          </div>
        </>
      )}
    </div>
  )
}
