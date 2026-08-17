// Dev-only sign-in session: the identity this SPA presents to the API locally.
//
// It stands in for the UBS SSO proxy during local development and follows the same shape — the
// identity is established once, at the sign-in gate, and holds for the whole session; it is never
// toggled from the app chrome. Compiled in for dev builds and when VITE_DEV_SIGN_IN=true.
//
// The chosen identity is held in a session cookie, mirroring the cookie the SSO proxy sets after a
// successful single sign-on: it survives reloads and new tabs, so the identity is established once
// per browser session rather than at every page load. It carries no Max-Age/Expires, so the browser
// discards it when the session ends and the next run starts back at the gate — the identity under
// test is always one an operator chose, never a stale default from an earlier run.
//
// In production the trusted SSO proxy is the sole identity source and injects the X-Auth-* headers;
// RBAC_ROLES.md forbids any in-app user or role switcher there, and the proxy strips
// client-supplied auth headers so this cannot be a spoof vector. See installDevAuth.ts for how the
// signed-in identity reaches the API.

import { roleFromLabel, type Role } from './roles'
import { USERS, type User } from '../config/navigationConfig'

/** True when the dev sign-in gate (and its header injection) is active. */
export const DEV_SIGN_IN: boolean =
  import.meta.env.DEV || import.meta.env.VITE_DEV_SIGN_IN === 'true'

// Deliberately not the retired role switcher's `pe-sub-dev-user` localStorage key: that key outlives
// the browser session, so a machine that had used the switcher silently reopened as whoever it held
// and never reached the gate.
const SESSION_COOKIE = 'pe-sub-dev-session'

let signedInUser: User | null = readInitialUser()
const listeners = new Set<() => void>()

// Guarded document access — test/SSR environments have no DOM.
function cookieJar(): Document | null {
  try {
    return typeof document !== 'undefined' && typeof document.cookie === 'string' ? document : null
  } catch {
    return null
  }
}

function readSessionCookie(): string | null {
  const jar = cookieJar()
  if (!jar) return null
  for (const entry of jar.cookie.split(';')) {
    const [name, ...value] = entry.split('=')
    if (name.trim() === SESSION_COOKIE) return decodeURIComponent(value.join('=').trim())
  }
  return null
}

// No Max-Age/Expires: a session cookie, discarded when the browser session ends. SameSite=Strict
// because it is only ever read by this origin's own SPA.
function writeSessionCookie(uuName: string): void {
  const jar = cookieJar()
  if (jar) jar.cookie = `${SESSION_COOKIE}=${encodeURIComponent(uuName)}; path=/; SameSite=Strict`
}

function clearSessionCookie(): void {
  const jar = cookieJar()
  if (jar) jar.cookie = `${SESSION_COOKIE}=; path=/; SameSite=Strict; Max-Age=0`
}

// The session cookie resumes the identity across reloads and new tabs, the way the SSO cookie does.
// An unknown or absent value means signed out, which is what sends the app to the gate.
function readInitialUser(): User | null {
  if (!DEV_SIGN_IN) return null
  const stored = readSessionCookie()
  return USERS.find(user => user.uuName === stored) ?? null
}

/** The signed-in identity, or null while signed out. Stable reference — safe as a store snapshot. */
export function getSignedInUser(): User | null {
  return signedInUser
}

export function isSignedIn(): boolean {
  return signedInUser !== null
}

/** Capability role of the signed-in user; least-privileged VIEWER while signed out. */
export function getRole(): Role {
  return signedInUser ? roleFromLabel(signedInUser.role) : 'VIEWER'
}

export function signIn(user: User): void {
  if (user.uuName === signedInUser?.uuName) return
  signedInUser = user
  writeSessionCookie(user.uuName)
  listeners.forEach(l => l())
}

export function signOut(): void {
  if (!signedInUser) return
  signedInUser = null
  clearSessionCookie()
  listeners.forEach(l => l())
}

/** Subscribe to session changes (used by useSyncExternalStore in AuthContext and the gate). */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/**
 * Identity headers for the API, derived from the signed-in user. Emitted only when the dev gate is
 * active and a session exists; empty otherwise so production relies entirely on the SSO proxy.
 * pe-sub-api honours them in both modes: GATEWAY trusts only these headers, and its default DEV
 * mode prefers them over its fixed dev identity, which it falls back to only for header-less
 * callers (service jobs, curl, the reachability ping).
 */
export function getAuthHeaders(): Record<string, string> {
  if (!DEV_SIGN_IN || !signedInUser) return {}
  return {
    'X-Auth-User': signedInUser.uuName,
    'X-Auth-First-Name': signedInUser.firstName,
    'X-Auth-Last-Name': signedInUser.lastName,
    'X-Auth-Email': signedInUser.email,
    'X-Auth-Roles': roleFromLabel(signedInUser.role),
  }
}
