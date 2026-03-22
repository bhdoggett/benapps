import styles from './RangeSlider.module.css'

type Props = {
  min: number
  max: number
  value: number
  onChange: (v: number) => void
  vertical?: boolean
  size?: number
  className?: string
}

export default function RangeSlider({ min, max, value, onChange, vertical, size, className }: Props) {
  return (
    <input
      type="range"
      className={[vertical ? styles.vertical : styles.slider, className].filter(Boolean).join(' ')}
      style={vertical && size ? { height: size } : undefined}
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}
