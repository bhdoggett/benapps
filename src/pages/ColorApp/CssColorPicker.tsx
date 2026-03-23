import { useState, useRef, useEffect, useMemo } from 'react'
import styles from './ColorApp.module.css'

// All 148 standard CSS named colors (plus rebeccapurple)
const CSS_NAMED_COLORS = [
  'aliceblue','antiquewhite','aqua','aquamarine','azure','beige','bisque','black',
  'blanchedalmond','blue','blueviolet','brown','burlywood','cadetblue','chartreuse',
  'chocolate','coral','cornflowerblue','cornsilk','crimson','cyan','darkblue',
  'darkcyan','darkgoldenrod','darkgray','darkgreen','darkgrey','darkkhaki',
  'darkmagenta','darkolivegreen','darkorange','darkorchid','darkred','darksalmon',
  'darkseagreen','darkslateblue','darkslategray','darkslategrey','darkturquoise',
  'darkviolet','deeppink','deepskyblue','dimgray','dimgrey','dodgerblue','firebrick',
  'floralwhite','forestgreen','fuchsia','gainsboro','ghostwhite','gold','goldenrod',
  'gray','green','greenyellow','grey','honeydew','hotpink','indianred','indigo',
  'ivory','khaki','lavender','lavenderblush','lawngreen','lemonchiffon','lightblue',
  'lightcoral','lightcyan','lightgoldenrodyellow','lightgray','lightgreen','lightgrey',
  'lightpink','lightsalmon','lightseagreen','lightskyblue','lightslategray',
  'lightslategrey','lightsteelblue','lightyellow','lime','limegreen','linen',
  'magenta','maroon','mediumaquamarine','mediumblue','mediumorchid','mediumpurple',
  'mediumseagreen','mediumslateblue','mediumspringgreen','mediumturquoise',
  'mediumvioletred','midnightblue','mintcream','mistyrose','moccasin','navajowhite',
  'navy','oldlace','olive','olivedrab','orange','orangered','orchid','palegoldenrod',
  'palegreen','paleturquoise','palevioletred','papayawhip','peachpuff','peru','pink',
  'plum','powderblue','purple','rebeccapurple','red','rosybrown','royalblue',
  'saddlebrown','salmon','sandybrown','seagreen','seashell','sienna','silver',
  'skyblue','slateblue','slategray','slategrey','snow','springgreen','steelblue',
  'tan','teal','thistle','tomato','turquoise','violet','wheat','white','whitesmoke',
  'yellow','yellowgreen',
]

// Convert a CSS color name to a #rrggbb hex string via canvas
function nameToHex(name: string): string {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = name
  ctx.fillRect(0, 0, 1, 1)
  ctx.fillStyle = name
  return ctx.fillStyle as string // browsers normalize to '#rrggbb'
}

export default function CssColorPicker({ onPick }: { onPick: (hex: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState<number>(-1)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const filtered = useMemo(() => {
    const q = query.toLowerCase().replace(/[\s\-_]/g, '')
    if (!q) return CSS_NAMED_COLORS
    return CSS_NAMED_COLORS.filter(n => n.includes(q))
  }, [query])

  // Reset highlight when filtered list changes
  useEffect(() => { setHighlighted(-1) }, [filtered])

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlighted < 0 || !listRef.current) return
    const item = listRef.current.children[highlighted] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  // Auto-focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  function pick(name: string) {
    onPick(nameToHex(name))
    setOpen(false)
    setQuery('')
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { setOpen(false); setQuery(''); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      const target = highlighted >= 0 ? filtered[highlighted] : filtered[0]
      if (target) pick(target)
    }
  }

  return (
    <div ref={wrapRef} className={styles.cssPickerWrap}>
      <button
        className={styles.iconBtn}
        title="Named colors"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span className={styles.cssPickerA}>A</span>
      </button>

      {open && (
        <div className={styles.cssPickerDropdown}>
          <input
            ref={inputRef}
            className={styles.cssPickerInput}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="filter…"
            spellCheck={false}
          />
          <ul ref={listRef} className={styles.cssPickerList}>
            {filtered.map((name, i) => (
              <li
                key={name}
                className={`${styles.cssPickerItem}${i === highlighted ? ` ${styles.cssPickerItemActive}` : ''}`}
                onPointerDown={() => pick(name)}
                onPointerEnter={() => setHighlighted(i)}
              >
                <span className={styles.cssPickerSwatch} style={{ background: name }} />
                <span className={styles.cssPickerName}>{name}</span>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className={styles.cssPickerEmpty}>no match</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
