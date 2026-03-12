import { Component, ReactNode } from 'react'
import { useRouteError } from 'react-router-dom'
import styles from './ErrorBoundary.module.css'

export function RouteErrorFallback() {
  const error = useRouteError() as Error
  return (
    <div className={styles.wrapper}>
      <p className={styles.heading}>something went wrong.</p>
      <p className={styles.message}>{error?.message ?? String(error)}</p>
      <button className={styles.btn} onClick={() => window.location.reload()}>
        reload
      </button>
    </div>
  )
}

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    const { error } = this.state
    if (error) {
      return (
        <div className={styles.wrapper}>
          <p className={styles.heading}>something went wrong.</p>
          <p className={styles.message}>{error.message}</p>
          <button className={styles.btn} onClick={() => window.location.reload()}>
            reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
