import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ROLES, roleFromLabel } from '../auth/roles'
import {
  DEV_SIGN_IN, getAuthHeaders, getRole, getSignedInUser, isSignedIn, signIn, signOut, subscribe,
} from '../auth/session'
import { USERS, type User } from '../config/navigationConfig'

// The dev sign-in gate stands in for the UBS SSO proxy: the identity chosen there is what the SPA
// sends to pe-sub-api as X-Auth-* headers, and the capability role is derived from that identity
// (there is no independent role switch). These tests pin that derivation and the header contract.

// Minimal document.cookie stand-in — this suite runs in the node environment, and what it asserts
// is which identity survives a page load, which is exactly what a cookie jar models.
function stubCookieJar(initial: Record<string, string> = {}): void {
  const jar = new Map(Object.entries(initial))
  vi.stubGlobal('document', {
    get cookie(): string {
      return [...jar].map(([name, value]) => `${name}=${value}`).join('; ')
    },
    set cookie(entry: string) {
      const [pair, ...attributes] = entry.split(';')
      const [name, ...value] = pair.split('=')
      if (attributes.some(a => a.trim().toLowerCase() === 'max-age=0')) jar.delete(name.trim())
      else jar.set(name.trim(), value.join('=').trim())
    },
  })
}

function userByUuName(uuName: string): User {
  const user = USERS.find(item => item.uuName === uuName)
  if (!user) throw new Error(`No dev user ${uuName} in USERS`)
  return user
}

const analyst = userByUuName('js25029')
const manager = userByUuName('lt09341')
const viewer = userByUuName('ar77120')

describe('dev sign-in session', () => {
  beforeEach(() => { signOut() })

  it('is compiled in under dev/test builds', () => {
    expect(DEV_SIGN_IN).toBe(true)
  })

  it('sends no identity headers and holds least privilege while signed out', () => {
    expect(isSignedIn()).toBe(false)
    expect(getSignedInUser()).toBeNull()
    expect(getRole()).toBe('VIEWER')
    expect(getAuthHeaders()).toEqual({})
  })

  it('sends the signed-in identity as the headers the SSO proxy injects in production', () => {
    signIn(analyst)

    expect(isSignedIn()).toBe(true)
    expect(getAuthHeaders()).toEqual({
      'X-Auth-User': 'js25029',
      'X-Auth-First-Name': 'J.',
      'X-Auth-Last-Name': 'Smith',
      'X-Auth-Email': 'john.smith@ubs.com',
      'X-Auth-Roles': 'ANALYST',
    })
  })

  it('derives the capability role from the signed-in user, not a separate selection', () => {
    signIn(manager)
    expect(getRole()).toBe('MANAGER')
    expect(getAuthHeaders()['X-Auth-Roles']).toBe('MANAGER')

    signIn(viewer)
    expect(getRole()).toBe('VIEWER')
    expect(getAuthHeaders()['X-Auth-Roles']).toBe('VIEWER')
  })

  it('offers one signable identity per capability role, each with a resolvable role label', () => {
    for (const user of USERS) {
      // An unrecognised label silently collapses to VIEWER, which would hand an analyst a
      // read-only session — assert the label actually round-trips instead.
      expect(ROLES[roleFromLabel(user.role)].label).toBe(user.role)
    }
    const rolesOffered = new Set(USERS.map(user => roleFromLabel(user.role)))
    expect([...rolesOffered].sort()).toEqual(['ANALYST', 'MANAGER', 'VIEWER'])
  })

  it('sets a session cookie on sign in and clears it on sign out', () => {
    stubCookieJar()

    signIn(manager)
    // No Max-Age/Expires — a session cookie the browser drops when the session ends, so the
    // identity persists across reloads without ever becoming a durable default.
    expect(document.cookie).toContain(`pe-sub-dev-session=${manager.uuName}`)

    signOut()
    expect(document.cookie).not.toContain(manager.uuName)

    vi.unstubAllGlobals()
  })

  it('resumes the identity from the session cookie, so a reload does not return to the gate', async () => {
    stubCookieJar({ 'pe-sub-dev-session': manager.uuName })
    vi.resetModules()

    const reloaded = await import('../auth/session')

    expect(reloaded.isSignedIn()).toBe(true)
    expect(reloaded.getSignedInUser()?.uuName).toBe(manager.uuName)
    expect(reloaded.getAuthHeaders()['X-Auth-Roles']).toBe('MANAGER')

    vi.unstubAllGlobals()
  })

  it('starts at the gate when no session cookie exists, ignoring the retired switcher key', async () => {
    // The retired dev role switcher persisted its selection under `pe-sub-dev-user` in
    // localStorage, which outlives the browser session. Reading it would reopen the app as
    // whoever it holds — J. Smith on any machine that used the switcher — and skip the gate.
    stubCookieJar()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (key === 'pe-sub-dev-user' ? analyst.uuName : null),
      setItem: () => {},
      removeItem: () => {},
    })
    vi.resetModules()

    const reloaded = await import('../auth/session')

    expect(reloaded.isSignedIn()).toBe(false)
    expect(reloaded.getSignedInUser()).toBeNull()
    expect(reloaded.getAuthHeaders()).toEqual({})

    vi.unstubAllGlobals()
  })

  it('ends the session on sign out so no identity reaches the API', () => {
    signIn(manager)
    signOut()

    expect(isSignedIn()).toBe(false)
    expect(getAuthHeaders()).toEqual({})
  })

  it('notifies subscribers when the session starts and ends', () => {
    let notifications = 0
    const unsubscribe = subscribe(() => { notifications += 1 })

    signIn(analyst)
    signIn(analyst)  // re-selecting the active identity is a no-op
    signOut()
    unsubscribe()
    signIn(manager)

    expect(notifications).toBe(2)
  })
})

describe('roleFromLabel', () => {
  it('maps the server display roles to capability roles', () => {
    expect(roleFromLabel('Analyst')).toBe('ANALYST')
    expect(roleFromLabel('Account/Transaction Manager')).toBe('MANAGER')
    expect(roleFromLabel('IT — Read Only')).toBe('VIEWER')
  })

  it('collapses unknown or service roles to least privilege', () => {
    expect(roleFromLabel('Service')).toBe('VIEWER')
    expect(roleFromLabel('')).toBe('VIEWER')
  })
})
