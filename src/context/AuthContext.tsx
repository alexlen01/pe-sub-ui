import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { getRole, setRole as setRoleStore, subscribe, DEV_ROLE_SWITCHER } from '../auth/session'
import { ROLES, can as canForRole, type Capability, type Role, type RoleMeta } from '../auth/roles'
import { api } from '../services/api'

interface AuthState {
  role:    Role
  meta:    RoleMeta
  /** True when the local dev role switcher is available (never in production). */
  canSwitchRole: boolean
  setRole: (role: Role) => void
  /** Capability check for UI gating — mirrors the server, never a substitute for it. */
  can:     (capability: Capability) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

// Maps the server's display-role string (CurrentUserService.displayRole) back to a Role token.
// Anything unrecognised (Service, unknown) collapses to the least-privileged VIEWER so the UI
// never grants operator affordances it can't justify.
function mapServerRole(serverRole: string): Role {
  switch (serverRole) {
    case 'Analyst':                      return 'ANALYST'
    case 'Account/Transaction Manager':  return 'MANAGER'
    default:                             return 'VIEWER'
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Local dev: the switcher is authoritative (it also sets the X-Auth headers). Production: the
  // real authenticated role comes from /api/users/me, so gating reflects the actual user instead
  // of a fixed default. Least-privilege (VIEWER) until /me resolves.
  const switcherRole = useSyncExternalStore(subscribe, getRole, getRole)
  const [meRole, setMeRole] = useState<Role>('VIEWER')

  useEffect(() => {
    if (DEV_ROLE_SWITCHER) return  // switcher drives the role locally; skip the /me round-trip
    let cancelled = false
    api.users.me()
      .then(u => { if (!cancelled) setMeRole(mapServerRole(u.role)) })
      .catch(() => { if (!cancelled) setMeRole('VIEWER') })
    return () => { cancelled = true }
  }, [])

  const role: Role = DEV_ROLE_SWITCHER ? switcherRole : meRole
  const value: AuthState = {
    role,
    meta: ROLES[role],
    canSwitchRole: DEV_ROLE_SWITCHER,
    setRole: setRoleStore,
    can: (capability) => canForRole(role, capability),
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
