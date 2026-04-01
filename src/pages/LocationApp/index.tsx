import { useState, useEffect, useRef } from 'react'
import AppHeader from '../../components/AppHeader'
import { useIsLandscapeMobile } from '../../hooks/useIsLandscapeMobile'
import styles from './LocationApp.module.css'

type Status = 'idle' | 'loading' | 'success' | 'error'

const ERROR_MESSAGES: Record<number, string> = {
  [GeolocationPositionError.PERMISSION_DENIED]: 'permission denied',
  [GeolocationPositionError.POSITION_UNAVAILABLE]: 'position unavailable',
  [GeolocationPositionError.TIMEOUT]: 'request timed out',
}

export default function LocationApp() {
  const isLandscapeMobile = useIsLandscapeMobile()
  const [status, setStatus] = useState<Status>('idle')
  const [coords, setCoords] = useState<{ lat: number; lon: number; accuracy: number } | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [copied, setCopied] = useState<string | null>(null)
  const watchRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current)
    }
  }, [])

  function startWatch() {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current)
    setStatus('loading')
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy })
        setStatus('success')
      },
      (err) => {
        setErrorMsg(ERROR_MESSAGES[err.code] ?? 'unknown error')
        setStatus('error')
      },
      { enableHighAccuracy: true }
    )
  }

  function copyValue(value: string, key: string) {
    navigator.clipboard.writeText(value)
    setCopied(key)
    setTimeout(() => setCopied(null), 1200)
  }

  const mapsUrl = coords
    ? `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lon}`
    : null

  const inner = (
    <div className={styles.content}>
      {status === 'success' && coords ? (
        <div className={styles.coords}>
          <div className={styles.coordRow}>
            <span className={styles.label}>latitude</span>
            <span className={styles.value} onClick={() => copyValue(coords.lat.toFixed(6), 'lat')}>
              {copied === 'lat' ? 'copied' : coords.lat.toFixed(6)}
            </span>
          </div>
          <div className={styles.coordRow}>
            <span className={styles.label}>longitude</span>
            <span className={styles.value} onClick={() => copyValue(coords.lon.toFixed(6), 'lon')}>
              {copied === 'lon' ? 'copied' : coords.lon.toFixed(6)}
            </span>
          </div>
          <div className={styles.coordRow}>
            <span className={styles.label}>accuracy</span>
            <span className={styles.accuracy}>±{Math.round(coords.accuracy)}m</span>
          </div>
        </div>
      ) : status === 'error' ? (
        <p className={styles.errorMsg}>{errorMsg}</p>
      ) : status === 'loading' ? (
        <p className={styles.statusMsg}>locating…</p>
      ) : null}

      {status !== 'loading' && (
        <div className={styles.btnRow}>
          <button className={styles.btn} onClick={startWatch}>
            {status === 'success' ? 'refresh' : 'get location'}
          </button>
          {mapsUrl && (
            <a className={styles.mapsLink} href={mapsUrl} target="_blank" rel="noreferrer">
              open in maps ↗
            </a>
          )}
        </div>
      )}
    </div>
  )

  if (isLandscapeMobile) {
    return <div className={styles.focusOverlay}>{inner}</div>
  }

  return (
    <div className={styles.app}>
      <AppHeader
        title="location"
        about={<>
          <p>Shows your GPS coordinates and accuracy.</p>
          <ul>
            <li>Grant location permission when prompted to start</li>
            <li>Coordinates update live as GPS accuracy improves</li>
            <li>Tap a coordinate to copy it to the clipboard</li>
          </ul>
        </>}
      />
      {inner}
    </div>
  )
}
