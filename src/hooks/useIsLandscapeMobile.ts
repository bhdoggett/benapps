import { useEffect, useState } from 'react'

export function useIsLandscapeMobile(): boolean {
  const [is, setIs] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(orientation: landscape) and (pointer: coarse)')
    const update = () => setIs(media.matches)
    update()
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])
  return is
}
