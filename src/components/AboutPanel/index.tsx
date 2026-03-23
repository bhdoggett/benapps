import { useEffect, useRef } from 'react'
import styles from './AboutPanel.module.css'

interface Props {
  children: React.ReactNode
  onClose: () => void
  triggerRef: React.RefObject<HTMLButtonElement>
}

export default function AboutPanel({ children, onClose, triggerRef }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelRef.current?.focus()
    return () => {
      triggerRef.current?.focus()
    }
  }, [triggerRef])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="About this app"
        tabIndex={-1}
      >
        <div className={styles.panelInner}>
          {children}
        </div>
      </div>
    </>
  )
}
