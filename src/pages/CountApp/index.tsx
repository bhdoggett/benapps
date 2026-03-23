import { useState } from 'react'
import AppHeader from '../../components/AppHeader'
import styles from './CountApp.module.css'

export default function CountApp() {
  const [count, setCount] = useState(0)

  return (
    <div className={styles.app}>
      <AppHeader
        title="count"
        about={<>
          <p>A single incrementing counter. Resets when you clear it.</p>
          <ul>
            <li>Tap + or − to increment or decrement</li>
            <li>Drag the number up or down to change it quickly</li>
            <li>Hold the clear button to reset to zero</li>
          </ul>
        </>}
      />
      <div className={styles.countRow}>
        <button className={styles.adjBtn} onClick={() => setCount(c => Math.max(0, c - 1))}>−</button>
        <div className={styles.display}>{count}</div>
        <button className={styles.adjBtn} onClick={() => setCount(c => c + 1)}>+</button>
      </div>
      <div className={styles.btnRowClear}>
        <button className={[styles.btn, styles.btnClear].join(' ')} onClick={() => setCount(0)}>clear</button>
      </div>
    </div>
  )
}
