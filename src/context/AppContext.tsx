import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { SCREENS as SCREEN_MAP } from '../config/screenConfig'
import { getLPsForFacility } from '../services/lpService'
import { DEFAULT_FACILITY_PARAMS } from '../services/bbCalculationService'
import { DEFAULT_USER, USERS, type User } from '../config/navigationConfig'
import { api, type CurrentUser } from '../services/api'
import { useServerEvents } from '../hooks/useServerEvents'
import { useAuth } from './AuthContext'
import { getDevUser, setDevIdentity } from '../auth/session'
import type { Role } from '../auth/roles'
import type { LPRecord } from '../services/lpService'
import { buildReclassificationNotifications, buildReviewNotifications, type ReviewNotification } from '../utils/reviewNotifications'

export { SCREEN_MAP as SCREENS }

export interface ToastItem { id: number; msg: string; variant?: 'warning' | 'success' }

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
  setCurrentUser: (user: User | undefined) => void
  users: User[]
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
  reviewNotifications: ReviewNotification[]
  notificationsLoading: boolean
  refreshReviewNotifications: () => Promise<void>
}

const AppContext = createContext<AppState | null>(null)

function roleForUser(user: User): Role {
  return user.role === 'Account/Transaction Manager' ? 'MANAGER' : 'ANALYST'
}

function userForRole(role: Role): User {
  return role === 'MANAGER'
    ? USERS.find(user => user.role === 'Account/Transaction Manager') ?? DEFAULT_USER
    : DEFAULT_USER
}

function userForDevUser(devUser: string): User | undefined {
  return USERS.find(user => user.uuName === devUser)
}

function initials(firstName: string, lastName: string, uuName: string): string {
  const fromName = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
  return fromName || uuName.slice(0, 2).toUpperCase()
}

function toDisplayName(firstName: string, lastName: string, uuName: string): string {
  return [firstName, lastName].filter(Boolean).join(' ') || uuName
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { role, setRole, canSwitchRole, can } = useAuth()
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
  const [currentUser,        setCurrentUser]      = useState<User>(DEFAULT_USER)
  const [reviewNotifications, setReviewNotifications] = useState<ReviewNotification[]>([])
  const [notificationsLoading, setNotificationsLoading] = useState(true)
  const toastSeq = useRef(0)
  const toastTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  const switchCurrentUser = useCallback((user: User | undefined) => {
    if (!user) return
    if (!canSwitchRole) { setCurrentUser(user); return }
    // No-op when re-selecting the active identity (avoids a pointless reload).
    if (user.uuName === getDevUser()) return
    // Persist the selected identity + role so they survive the reload (X-Auth-* headers are
    // rebuilt from these on next load).
    setDevIdentity(user)
    setRole(roleForUser(user))
    // Force a fresh session under the selected user: startup re-runs POST /api/audit/login (a new
    // Login audit entry attributed to this user) and re-fetches the user context, so the switched
    // identity is set consistently across every page/screen.
    window.location.reload()
  }, [canSwitchRole, setRole])

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

  useEffect(() => {
    if (canSwitchRole) return
    const toUiUser = (user: CurrentUser): User => {
      return {
        uuName: user.uuName,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        name: toDisplayName(user.firstName, user.lastName, user.uuName),
        initials: initials(user.firstName, user.lastName, user.uuName),
        role: user.role,
        department: '',
      }
    }
    api.users.me().then(user => setCurrentUser(toUiUser(user))).catch(() => {
      setCurrentUser({ ...DEFAULT_USER, name: 'Unavailable', initials: '—', role: '' })
    })
  }, [canSwitchRole])

  useEffect(() => {
    if (!canSwitchRole) return
    setCurrentUser(prev => {
      const storedUser = userForDevUser(getDevUser())
      if (storedUser && roleForUser(storedUser) === role) return storedUser
      return roleForUser(prev) === role ? prev : userForRole(role)
    })
  }, [canSwitchRole, role])

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

  const refreshReviewNotifications = useCallback(async () => {
    setNotificationsLoading(true)
    try {
      const [submissions, facilities] = await Promise.all([
        api.submissions.list(),
        api.facilities.list(),
      ])
      const reviewableFacilities = can('editLp')
        ? facilities.filter(facility => ['Needs Review', 'Review', 'Pending Review'].includes(facility.status))
        : []
      const lpGroups = await Promise.all(reviewableFacilities.map(async facility => [
        facility.id,
        await api.lpRecords.list({ facilityId: facility.id }),
      ] as const))
      setReviewNotifications([
        ...buildReviewNotifications(submissions, currentUser.uuName, can('reviewShadowBB')),
        ...buildReclassificationNotifications(facilities, new Map(lpGroups)),
      ])
    } catch {
      // A failed refresh must never leave a stale badge suggesting work that may no longer exist.
      setReviewNotifications([])
    } finally {
      setNotificationsLoading(false)
    }
  }, [can, currentUser.uuName])

  useEffect(() => {
    void refreshReviewNotifications()
    const timer = setInterval(() => { void refreshReviewNotifications() }, 30_000)
    return () => clearInterval(timer)
  }, [refreshReviewNotifications])

  const handleServerMessage = useCallback((message: string) => {
    toast(message)
    void refreshReviewNotifications()
  }, [refreshReviewNotifications, toast])

  useServerEvents(handleServerMessage)

  return (
    <AppContext.Provider value={{
      screen, navigate,
      toasts, toast, dismissToast,
      lpData, lpLoading, setLpData, refreshLpData, updateLPRecord,
      bbParams, setBbParams,
      currentUser, setCurrentUser: switchCurrentUser, users: USERS,
      activeSubmission, setActiveSubmission,
      activeSubmissionId, setActiveSubmissionId,
      activeFacilityId, setActiveFacilityId,
      abortedFacilities, abortSubmission,
      targetFacility, setTargetFacility,
      reviewNotifications, notificationsLoading, refreshReviewNotifications,
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
