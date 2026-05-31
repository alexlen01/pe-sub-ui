import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { SCREENS as SCREEN_MAP } from '../config/screenConfig'
import { getLPsForFacilitySync } from '../services/lpService'
import { DEFAULT_FACILITY_PARAMS } from '../services/bbCalculationService'
import { DEFAULT_USER } from '../config/navigationConfig'
import { useServerEvents } from '../hooks/useServerEvents'
import type { LPRecord } from '../services/lpService'

export { SCREEN_MAP as SCREENS }

export interface ToastItem { id: number; msg: string }
export interface User { name: string; initials: string; role: string; department: string; notifications: number }

interface AppState {
  screen: string
  navigate: (name: string) => void
  toasts: ToastItem[]
  toast: (msg: string, duration?: number) => void
  lpData: LPRecord[]
  setLpData: (lps: LPRecord[]) => void
  updateLPRecord: (updated: LPRecord) => void
  bbParams: typeof DEFAULT_FACILITY_PARAMS
  setBbParams: (p: typeof DEFAULT_FACILITY_PARAMS) => void
  currentUser: User
  activeSubmission: string | null
  setActiveSubmission: (s: string | null) => void
  abortedFacilities: string[]
  abortSubmission: (facility: string) => void
  targetFacility: string | null
  setTargetFacility: (f: string | null) => void
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [screen,            setScreen]           = useState('dashboard')
  const [toasts,            setToasts]           = useState<ToastItem[]>([])
  const [lpData,            setLpData]           = useState<LPRecord[]>(() => getLPsForFacilitySync('Blue Owl GP Stakes V'))
  const [bbParams,          setBbParams]         = useState(DEFAULT_FACILITY_PARAMS)
  const [activeSubmission,  setActiveSubmission] = useState<string | null>(null)
  const [abortedFacilities, setAbortedFacilities] = useState<string[]>([])
  const [targetFacility,    setTargetFacility]   = useState<string | null>(null)

  const navigate = useCallback((name: string) => {
    if (SCREEN_MAP[name]) { setScreen(name); setToasts([]) }
  }, [])

  const toast = useCallback((msg: string, duration = 3200) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, msg }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
  }, [])

  const updateLPRecord = useCallback((updated: LPRecord) => {
    setLpData(prev => prev.map(lp => lp.rank === updated.rank ? updated : lp))
  }, [])

  const abortSubmission = useCallback((facility: string) => {
    if (facility) setAbortedFacilities(prev => [...prev, facility])
  }, [])

  useServerEvents(toast)

  return (
    <AppContext.Provider value={{
      screen, navigate,
      toasts, toast,
      lpData, setLpData, updateLPRecord,
      bbParams, setBbParams,
      currentUser: DEFAULT_USER,
      activeSubmission, setActiveSubmission,
      abortedFacilities, abortSubmission,
      targetFacility, setTargetFacility,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
