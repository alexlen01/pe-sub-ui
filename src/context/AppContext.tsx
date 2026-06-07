import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { SCREENS as SCREEN_MAP } from '../config/screenConfig'
import { getLPsForFacility } from '../services/lpService'
import { DEFAULT_FACILITY_PARAMS } from '../services/bbCalculationService'
import { DEFAULT_USER } from '../config/navigationConfig'
import { useServerEvents } from '../hooks/useServerEvents'
import type { LPRecord } from '../services/lpService'

export { SCREEN_MAP as SCREENS }

export type ScreenMode = 'detecting' | 'live' | 'prototype'

export interface ToastItem { id: number; msg: string }
export interface User { name: string; initials: string; role: string; department: string; notifications: number }

interface AppState {
  screen: string
  navigate: (name: string) => void
  toasts: ToastItem[]
  toast: (msg: string, duration?: number) => void
  lpData: LPRecord[]
  lpLoading: boolean
  setLpData: (lps: LPRecord[]) => void
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
  screenMode: ScreenMode
  setScreenMode: (mode: ScreenMode) => void
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
  const [screenMode,         setScreenMode]        = useState<ScreenMode>('detecting')

  useEffect(() => {
    if (activeFacilityId == null) return
    if (screenMode === 'detecting') return
    setLpLoading(true)
    getLPsForFacility(screenMode === 'live', activeFacilityId)
      .then(setLpData)
      .finally(() => setLpLoading(false))
  }, [activeFacilityId, screenMode])

  const navigate = useCallback((name: string) => {
    if (SCREEN_MAP[name]) { setScreenMode('detecting'); setScreen(name); setToasts([]) }
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
      lpData, lpLoading, setLpData, updateLPRecord,
      bbParams, setBbParams,
      currentUser: DEFAULT_USER,
      activeSubmission, setActiveSubmission,
      activeSubmissionId, setActiveSubmissionId,
      activeFacilityId, setActiveFacilityId,
      abortedFacilities, abortSubmission,
      targetFacility, setTargetFacility,
      screenMode, setScreenMode,
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
