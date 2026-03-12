import { Link } from 'react-router-dom'
import styles from './NotFound.module.css'

export default function NotFound() {
  return (
    <div className={styles.wrapper}>
      <p className={styles.heading}>page not found.</p>
      <Link className={styles.link} to="/">go home →</Link>
    </div>
  )
}
