// Active-role session store for the LOCAL dev role switcher.
//
// This is a development-only affordance for exercising RBAC in the app. It is compiled in for dev
// builds and when VITE_DEV_ROLE_SWITCHER=true. In production the trusted UBS SSO proxy is the sole
// identity source and injects the X-Auth-* headers; RBAC_ROLES.md forbids any in-app user/role
// switcher there, and the proxy strips client-supplied auth headers so this cannot be a spoof
// vector. See installDevAuth.ts for how the selected identity reaches the API.

import { ROLES, type Role } from './roles'
import { DEFAULT_USER, USERS, type User } from '../config/navigationConfig'

const STORAGE_KEY = 'pe-sub-dev-role'
const USER_STORAGE_KEY = 'pe-sub-dev-user'
const DEFAULT_ROLE: Role = 'ANALYST'

/** True when the dev role switcher (and its header injection) is active. */
export const DEV_ROLE_SWITCHER: boolean =
  import.meta.env.DEV || import.meta.env.VITE_DEV_ROLE_SWITCHER === 'true'

let currentRole: Role = readInitial()
let currentIdentity: Pick<User, 'uuName' | 'firstName' | 'lastName' | 'email'> = readInitialIdentity()
const listeners = new Set<() => void>()

// Guarded localStorage access — test/SSR environments may expose a partial or missing shim.
function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    if (typeof localStorage.getItem !== 'function') return null
    return localStorage
  } catch {
    return null
  }
}

function readInitial(): Role {
  if (!DEV_ROLE_SWITCHER) return DEFAULT_ROLE
  const stored = safeStorage()?.getItem(STORAGE_KEY) as Role | null | undefined
  return stored && stored in ROLES ? stored : DEFAULT_ROLE
}

function readInitialIdentity(): Pick<User, 'uuName' | 'firstName' | 'lastName' | 'email'> {
  if (!DEV_ROLE_SWITCHER) return DEFAULT_USER
  const stored = safeStorage()?.getItem(USER_STORAGE_KEY)
  return USERS.find(user => user.uuName === stored)
    ?? USERS.find(user => roleForUser(user) === currentRole)
    ?? DEFAULT_USER
}

function roleForUser(user: User): Role {
  return user.role === 'Account/Transaction Manager' ? 'MANAGER' : 'ANALYST'
}

export function getRole(): Role {
  return currentRole
}

export function setRole(role: Role): void {
  if (role === currentRole) return
  currentRole = role
  if (DEV_ROLE_SWITCHER) {
    try { safeStorage()?.setItem(STORAGE_KEY, role) } catch { /* ignore */ }
  }
  listeners.forEach(l => l())
}

export function getDevUser(): string {
  return currentIdentity.uuName
}

export function setDevUser(devUser: string): void {
  const user = USERS.find(item => item.uuName === devUser)
  if (user) setDevIdentity(user)
}

export function setDevIdentity(user: Pick<User, 'uuName' | 'firstName' | 'lastName' | 'email'>): void {
  if (!user.uuName || user.uuName === currentIdentity.uuName) return
  currentIdentity = {
    uuName: user.uuName,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
  }
  if (DEV_ROLE_SWITCHER) {
    try { safeStorage()?.setItem(USER_STORAGE_KEY, user.uuName) } catch { /* ignore */ }
  }
  listeners.forEach(l => l())
}

/** Subscribe to role changes (used by useSyncExternalStore in AuthContext). */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/**
 * Identity headers for the API, derived from the selected dev role. Emitted only when the dev
 * switcher is active; empty otherwise so production relies entirely on the SSO proxy. In the API's
 * default DEV mode these headers are ignored (fixed dev identity); they take effect only when the
 * API runs in GATEWAY mode locally, which is how end-to-end RBAC is exercised.
 */
export function getAuthHeaders(): Record<string, string> {
  if (!DEV_ROLE_SWITCHER) return {}
  return {
    'X-Auth-User': currentIdentity.uuName,
    'X-Auth-First-Name': currentIdentity.firstName,
    'X-Auth-Last-Name': currentIdentity.lastName,
    'X-Auth-Email': currentIdentity.email,
    'X-Auth-Roles': currentRole,
  }
}
