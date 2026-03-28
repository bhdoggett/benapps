import { useEffect } from 'react'
import { useAbout } from '../../contexts/AboutContext'
import styles from './AppHeader.module.css'

interface Props {
  title: string
  meta?: React.ReactNode
  about?: React.ReactNode
}

export default function AppHeader({ title, meta, about }: Props) {
  const { setContent, setIsOpen } = useAbout()

  useEffect(() => {
    if (about) {
      setContent(about)
      return () => {
        setContent(null)
        setIsOpen(false)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`app-header ${styles.appHeader}`}>
      <h1 className={styles.appTitle}>{title}</h1>
      <div className={styles.headerRule} />
      {meta && <div className={styles.headerMeta}>{meta}</div>}
    </div>
  )
}
