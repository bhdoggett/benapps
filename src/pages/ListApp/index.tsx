import { useState, useEffect, useRef, useCallback } from 'react'
import AppHeader from '../../components/AppHeader'
import styles from './ListApp.module.css'

const STORAGE_KEY = 'list_v1_items'

type Item = { id: number; text: string }

function load(): Item[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') || [] }
  catch { return [] }
}

function save(items: Item[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

export default function ListApp() {
  const [items, setItems] = useState<Item[]>(load)
  const [inputValue, setInputValue] = useState('')
  const listRef = useRef<HTMLUListElement>(null)
  const dragSrcId = useRef<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { save(items) }, [items])

  const metaText = items.length === 0 ? 'empty' : items.length === 1 ? '1 item' : `${items.length} items`

  function addItem(text: string): boolean {
    const trimmed = text.trim()
    if (!trimmed) return false
    setItems(prev => [{ id: Date.now(), text: trimmed }, ...prev])
    return true
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (addItem(inputValue)) {
      setInputValue('')
      // Animate first item
      requestAnimationFrame(() => {
        const first = listRef.current?.querySelector('li')
        if (first) {
          first.classList.add(styles.fresh)
          first.addEventListener('animationend', () => first.classList.remove(styles.fresh), { once: true })
        }
      })
    }
    inputRef.current?.focus()
  }

  function completeItem(id: number, el: HTMLLIElement) {
    el.classList.add(styles.completing)
    setTimeout(() => {
      el.classList.add(styles.removing)
      setTimeout(() => {
        setItems(prev => prev.filter(i => i.id !== id))
      }, 500)
    }, 1500)
  }

  // Drag-and-drop
  const handleDragStart = useCallback((e: React.DragEvent<HTMLLIElement>, id: number) => {
    const li = e.currentTarget
    if (li.classList.contains(styles.completing) || li.classList.contains(styles.removing)) {
      e.preventDefault(); return
    }
    dragSrcId.current = id
    e.dataTransfer.effectAllowed = 'move'
    setTimeout(() => li.classList.add(styles.dragging), 0)
  }, [])

  const handleDragEnd = useCallback((_e: React.DragEvent<HTMLLIElement>) => {
    dragSrcId.current = null
    listRef.current?.querySelectorAll('li').forEach(el =>
      el.classList.remove(styles.dragging, styles.dragAbove, styles.dragBelow)
    )
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLLIElement>, id: number) => {
    if (dragSrcId.current === null || dragSrcId.current === id) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const li = e.currentTarget
    const mid = li.getBoundingClientRect().top + li.getBoundingClientRect().height / 2
    li.classList.toggle(styles.dragAbove, e.clientY < mid)
    li.classList.toggle(styles.dragBelow, e.clientY >= mid)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLLIElement>) => {
    e.currentTarget.classList.remove(styles.dragAbove, styles.dragBelow)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent<HTMLLIElement>, id: number) => {
    e.preventDefault()
    if (dragSrcId.current === null || dragSrcId.current === id) return
    const srcId = dragSrcId.current
    const mid = e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2
    const insertBefore = e.clientY < mid
    setItems(prev => {
      const next = [...prev]
      const srcIdx = next.findIndex(i => i.id === srcId)
      const [moved] = next.splice(srcIdx, 1)
      const dstIdx = next.findIndex(i => i.id === id)
      next.splice(insertBefore ? dstIdx : dstIdx + 1, 0, moved)
      return next
    })
    e.currentTarget.classList.remove(styles.dragAbove, styles.dragBelow)
  }, [])

  // Touch drag
  function addTouchHandlers(handle: HTMLSpanElement, id: number, li: HTMLLIElement) {
    handle.addEventListener('touchstart', () => {
      if (li.classList.contains(styles.completing) || li.classList.contains(styles.removing)) return
      dragSrcId.current = id
      li.classList.add(styles.dragging)
    }, { passive: true })

    handle.addEventListener('touchmove', (e) => {
      if (dragSrcId.current === null) return
      e.preventDefault()
      const touch = e.touches[0]
      const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('li')
      listRef.current?.querySelectorAll('li').forEach(el => el.classList.remove(styles.dragAbove, styles.dragBelow))
      if (target && Number((target as HTMLElement).dataset.id) !== dragSrcId.current) {
        const mid = target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2
        target.classList.toggle(styles.dragAbove, touch.clientY < mid)
        target.classList.toggle(styles.dragBelow, touch.clientY >= mid)
      }
    }, { passive: false })

    handle.addEventListener('touchend', (e) => {
      if (dragSrcId.current === null) return
      const touch = e.changedTouches[0]
      const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('li')
      listRef.current?.querySelectorAll('li').forEach(el =>
        el.classList.remove(styles.dragging, styles.dragAbove, styles.dragBelow)
      )
      const srcId = dragSrcId.current
      if (target && Number((target as HTMLElement).dataset.id) !== srcId) {
        const mid = target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2
        const insertBefore = touch.clientY < mid
        const targetId = Number((target as HTMLElement).dataset.id)
        setItems(prev => {
          const next = [...prev]
          const srcIdx = next.findIndex(i => i.id === srcId)
          const [moved] = next.splice(srcIdx, 1)
          const dstIdx = next.findIndex(i => i.id === targetId)
          next.splice(insertBefore ? dstIdx : dstIdx + 1, 0, moved)
          return next
        })
      }
      dragSrcId.current = null
    })
  }

  return (
    <div className={styles.app}>
      <AppHeader
        title="list"
        meta={<div className={styles.headerMeta}><span>{metaText}</span></div>}
      />

      <ul className={styles.list} ref={listRef}>
        {items.length === 0 && (
          <li className={styles.emptyState}>nothing here</li>
        )}
        {items.map(item => (
          <li
            key={item.id}
            className={styles.listItem}
            data-id={item.id}
            draggable
            onDragStart={e => handleDragStart(e, item.id)}
            onDragEnd={handleDragEnd}
            onDragOver={e => handleDragOver(e, item.id)}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(e, item.id)}
            ref={el => {
              if (el) {
                const handle = el.querySelector(`.${styles.dragHandle}`)
                if (handle) addTouchHandlers(handle as HTMLSpanElement, item.id, el)
              }
            }}
          >
            <span className={styles.dragHandle} aria-hidden>⠿</span>
            <input
              type="checkbox"
              className={styles.itemCheck}
              aria-label="Complete item"
              onChange={e => {
                const li = e.currentTarget.closest('li') as HTMLLIElement
                completeItem(item.id, li)
              }}
            />
            <span className={styles.itemText}>{item.text}</span>
          </li>
        ))}
      </ul>

      <form className={styles.addForm} onSubmit={handleSubmit}>
        <div className={styles.addFormInner}>
          <span className={styles.addPrompt}>+</span>
          <input
            ref={inputRef}
            className={styles.addInput}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder="add item…"
          />
          <button type="submit" className={styles.addBtn}>add</button>
        </div>
      </form>
    </div>
  )
}
