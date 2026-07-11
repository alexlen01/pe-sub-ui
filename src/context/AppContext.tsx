import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { SCREENS as SCREEN_MAP } from '../config/screenConfig'
import { getLPsForFacility } from '../services/lpService'
import { DEFAULT_FACILITY_PARAMS } from '../services/bbCalculationService'
import { DEFAULT_USER } from '../config/navigationConfig'
import { useServerEvents } from '../hooks/useServerEvents'
import type { LPRecord } from '../services/lpService'

export { SCREEN_MAP as SCREENS }

export interface ToastItem { id: number; msg: string; variant?: 'warning' | 'success' }
export interface User { name: string; initials: string; role: string; department: string; notifications: number }

interface AppState {
  screen: string
  navigate: (name: string) => void
  toasts: ToastItem[]
  toast: (msg: string, duration?: number, variant?: ToastItem['variant']) => void
  dismissToast: (id: number) => void
  lpData: LPRecord[]
  lpLoading: boolean
  setLpData: (lps: LPRecord[]) => void
  refreshLpData: () => Promise<void>
  updateLPRecord: (updated: LPRecord) => void
  bbParams: typeof DEFAULT_FACILITY_PARAMS
  setBbParams: (p: typeof DEFAULT_FACILITY_PARAMS) => void
  currentUser: User
  activeSubmission: string | null
  setActiveSubmission: (s: string | null) => void
  activeSubmissionId: number | null
  setActiveSubmissionId: (id: number | null) => void
  activeFacilityId: number | null
  setActiveFacilityId: (id: number | null) => void
  abortedFacilities: string[]
  abortSubmission: (facility: string) => void
  targetFacility: string | null
  setTargetFacility: (f: string | null) => void
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [screen,             setScreen]            = useState('dashboard')
  const [toasts,             setToasts]            = useState<ToastItem[]>([])
  const [lpData,             setLpData]            = useState<LPRecord[]>([])
  const [lpLoading,          setLpLoading]         = useState(false)
  const [bbParams,           setBbParams]          = useState(DEFAULT_FACILITY_PARAMS)
  const [activeSubmission,   setActiveSubmission]  = useState<string | null>(null)
  const [activeSubmissionId, setActiveSubmissionId] = useState<number | null>(null)
  const [activeFacilityId,   setActiveFacilityId] = useState<number | null>(null)
  const [abortedFacilities,  setAbortedFacilities] = useState<string[]>([])
  const [targetFacility,     setTargetFacility]   = useState<string | null>(null)
  const toastSeq = useRef(0)
  const toastTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  // Loads LP Master records for the active facility. Exposed as refreshLpData so callers can
  // re-pull after a write (e.g. committing match decisions creates new LP records) without
  // waiting for activeFacilityId to change.
  const refreshLpData = useCallback((): Promise<void> => {
    if (activeFacilityId == null) return Promise.resolve()
    setLpLoading(true)
    return getLPsForFacility(activeFacilityId)
      .then(setLpData)
      .finally(() => setLpLoading(false))
  }, [activeFacilityId])

  useEffect(() => { void refreshLpData() }, [refreshLpData])

  const navigate = useCallback((name: string) => {
    if (SCREEN_MAP[name]) { setScreen(name) }
  }, [])

  const dismissToast = useCallback((id: number) => {
    clearTimeout(toastTimers.current[id])
    delete toastTimers.current[id]
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback((msg: string, duration = 3200, variant?: ToastItem['variant']) => {
    const id = ++toastSeq.current
    setToasts(prev => [...prev, { id, msg, variant }])
    toastTimers.current[id] = setTimeout(() => dismissToast(id), duration)
  }, [dismissToast])

  useEffect(() => {
    return () => {
      Object.values(toastTimers.current).forEach(clearTimeout)
    }
  }, [])

  const updateLPRecord = useCallback((updated: LPRecord) => {
    setLpData(prev => prev.map(LPRecord => {
      if (updated.id != null && LPRecord.id != null) {
        return LPRecord.id === updated.id ? updated : LPRecord
      }
      return LPRecord.name === updated.name ? updated : LPRecord
    }))
  }, [])

  const abortSubmission = useCallback((facility: string) => {
    if (facility) setAbortedFacilities(prev => [...prev, facility])
  }, [])

  useServerEvents(toast)

  return (
    <AppContext.Provider value={{
      screen, navigate,
      toasts, toast, dismissToast,
      lpData, lpLoading, setLpData, refreshLpData, updateLPRecord,
      bbParams, setBbParams,
      currentUser: DEFAULT_USER,
      activeSubmission, setActiveSubmission,
      activeSubmissionId, setActiveSubmissionId,
      activeFacilityId, setActiveFacilityId,
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
