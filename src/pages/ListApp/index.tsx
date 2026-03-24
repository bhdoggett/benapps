import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import AppHeader from '../../components/AppHeader'
import StatusMessage from '../../components/StatusMessage'
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
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [copied, setCopied] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)
  const dragSrcId = useRef<number | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const editInputRef = useRef<HTMLTextAreaElement>(null)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { save(items) }, [items])

  // Auto-resize textareas
  useLayoutEffect(() => {
    const ta = editInputRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
  }, [editValue])

  useLayoutEffect(() => {
    const ta = inputRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
  }, [inputValue])

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

  function startEdit(item: Item, e: React.MouseEvent<HTMLSpanElement>) {
    const clickX = e.clientX
    const clickY = e.clientY
    setEditingId(item.id)
    setEditValue(item.text)
    requestAnimationFrame(() => {
      const ta = editInputRef.current
      if (!ta) return
      ta.focus()
      let offset = item.text.length
      if ('caretPositionFromPoint' in document) {
        const pos = (document as Document & { caretPositionFromPoint(x: number, y: number): { offset: number } | null }).caretPositionFromPoint(clickX, clickY)
        if (pos) offset = pos.offset
      } else if ('caretRangeFromPoint' in document) {
        const range = (document as Document & { caretRangeFromPoint(x: number, y: number): Range | null }).caretRangeFromPoint(clickX, clickY)
        if (range) offset = range.startOffset
      }
      ta.setSelectionRange(offset, offset)
    })
  }

  function commitEdit() {
    if (editingId === null) return
    const trimmed = editValue.trim()
    if (trimmed) {
      setItems(prev => prev.map(i => i.id === editingId ? { ...i, text: trimmed } : i))
    }
    setEditingId(null)
  }

  function cancelEdit() {
    setEditingId(null)
  }

  function handleEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
  }

  function exportTxt() {
    const text = items.map(i => `- ${i.text}`).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'list.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  function copyList() {
    const text = items.map(i => `- ${i.text}`).join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
      copiedTimerRef.current = setTimeout(() => setCopied(false), 1200)
    })
  }

  // Drag-and-drop
  const handleDragStart = useCallback((e: React.DragEvent<HTMLLIElement>, id: number) => {
    const li = e.currentTarget
    if (li.classList.contains(styles.completing) || li.classList.contains(styles.removing)) {
      e.preventDefault(); return
    }
    if (editingId !== null) { e.preventDefault(); return }
    dragSrcId.current = id
    e.dataTransfer.effectAllowed = 'move'
    setTimeout(() => li.classList.add(styles.dragging), 0)
  }, [editingId])

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
        meta={
          <div className={styles.headerMeta}>
            <span>{metaText}</span>
            {items.length > 0 && (
              <div className={styles.exportRow}>
                <button className={styles.iconBtn} onClick={exportTxt} title="Download .txt" aria-label="Download as text file">
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7.5 2v8M4.5 7l3 3 3-3" />
                    <path d="M2 12h11" />
                  </svg>
                </button>
                <button className={styles.iconBtn} onClick={copyList} title="Copy to clipboard" aria-label="Copy list">
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="4" width="8" height="9" rx="1" />
                    <path d="M10 4V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h1" />
                  </svg>
                </button>
                <StatusMessage message="copied!" visible={copied} />
              </div>
            )}
          </div>
        }
        about={<>
          <p>A checklist that persists between visits. Add tasks, check them off, and reorder them freely.</p>
          <ul>
            <li>Press Enter to add a new item</li>
            <li>Click the checkbox to remove an item</li>
            <li>Click an item's text to edit it</li>
            <li>Drag the grip handle to reorder</li>
            <li>Download the list as a .txt file or copy it to the clipboard using the icons next to the item count</li>
          </ul>
        </>}
      />

      <form className={styles.addForm} onSubmit={handleSubmit}>
        <div className={styles.addFormInner}>
          <span className={styles.dragHandle} aria-hidden style={{ visibility: 'hidden' }}>⠿</span>
          <span className={styles.addPrompt}>+</span>
          <textarea
            ref={inputRef}
            className={styles.addInput}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder="add item…"
            rows={1}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e as unknown as React.FormEvent) }
            }}
          />
          <button type="submit" className={styles.addBtn}>add</button>
        </div>
      </form>

      <ul className={styles.list} ref={listRef}>
        {items.length === 0 && (
          <li className={styles.emptyState}>nothing here</li>
        )}
        {items.map(item => (
          <li
            key={item.id}
            className={[styles.listItem, editingId === item.id ? styles.editing : ''].filter(Boolean).join(' ')}
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
            {editingId === item.id ? (
              <textarea
                ref={editInputRef}
                className={styles.editInput}
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={handleEditKeyDown}
                rows={1}
              />
            ) : (
              <span
                className={styles.itemText}
                onClick={e => startEdit(item, e)}
                title="Click to edit"
              >
                {item.text}
              </span>
            )}
          </li>
        ))}
      </ul>

    </div>
  )
}
