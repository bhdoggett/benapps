import { Link } from 'react-router-dom'
import styles from './Landing.module.css'

const apps = [
  { path: '/list', name: 'list' },
  { path: '/count', name: 'count' },
  { path: '/text', name: 'text' },
  { path: '/image', name: 'image' },
  { path: '/audio', name: 'audio' },
  { path: '/decibels', name: 'decibels' },
  { path: '/location', name: 'location' },
  { path: '/timer', name: 'timer' },
  { path: '/tuner', name: 'tuner' },
  { path: '/metronome', name: 'metronome' },
]

export default function Landing() {
  return (
    <div className={styles.body}>
      <div className={styles.inner}>
        <h1 className={styles.title}>ben<br />apps</h1>
        <div className={styles.rule} />
        <ul className={styles.appList}>
          {apps.map(app => (
            <li key={app.path}>
              <Link className={styles.appLink} to={app.path}>
                <span className={styles.appName}>{app.name}</span>
                <span className={styles.arrow}>→</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
