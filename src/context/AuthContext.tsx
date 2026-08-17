import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { getRole, signOut as endDevSession, subscribe, DEV_SIGN_IN } from '../auth/session'
import { ROLES, can as canForRole, roleFromLabel, type Capability, type Role, type RoleMeta } from '../auth/roles'
import { api } from '../services/api'

interface AuthState {
  role:    Role
  meta:    RoleMeta
  /** True when the local dev sign-in gate is active (never in production). */
  devSignIn: boolean
  /** Ends the local dev session and returns to the gate. No-op in production. */
  signOut: () => void
  /** Capability check for UI gating — mirrors the server, never a substitute for it. */
  can:     (capability: Capability) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  // Local dev: the signed-in identity is authoritative (it also sets the X-Auth headers) and its
  // role is derived from that identity, so there is nothing to switch independently. Production:
  // the real authenticated role comes from /api/users/me, so gating reflects the actual user
  // instead of a fixed default. Least-privilege (VIEWER) until /me resolves.
  const sessionRole = useSyncExternalStore(subscribe, getRole, getRole)
  const [meRole, setMeRole] = useState<Role>('VIEWER')

  useEffect(() => {
    if (DEV_SIGN_IN) return  // the signed-in identity drives the role locally; skip the /me round-trip
    let cancelled = false
    api.users.me()
      .then(u => { if (!cancelled) setMeRole(roleFromLabel(u.role)) })
      .catch(() => { if (!cancelled) setMeRole('VIEWER') })
    return () => { cancelled = true }
  }, [])

  const role: Role = DEV_SIGN_IN ? sessionRole : meRole
  const value: AuthState = {
    role,
    meta: ROLES[role],
    devSignIn: DEV_SIGN_IN,
    signOut: () => {
      endDevSession()
      // Reload so no in-memory or module-level state survives the identity change, the way an SSO
      // logout redirect would discard it.
      window.location.reload()
    },
    can: (capability) => canForRole(role, capability),
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
