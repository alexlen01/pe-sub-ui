import { useEffect } from 'react'
import { useApp, type ScreenMode } from '../context/AppContext'
import { api } from '../services/api'

export type { ScreenMode }

export function useScreenMode(): ScreenMode {
  const { screenMode, setScreenMode } = useApp()

  useEffect(() => {
    if (screenMode !== 'detecting') return
    api.health.ping()
      .then(() => setScreenMode('live'))
      .catch(() => { window.location.replace('http://localhost:5173') })
  }, [screenMode, setScreenMode])

  return screenMode
}
