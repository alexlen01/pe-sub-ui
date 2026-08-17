import { useSyncExternalStore, type ReactNode } from 'react'
import { ROLES, roleFromLabel } from '../../auth/roles'
import { DEV_SIGN_IN, isSignedIn, signIn, subscribe } from '../../auth/session'
import { APP_SUBTITLE, APP_TITLE, USERS, type User } from '../../config/navigationConfig'
import { api } from '../../services/api'

/**
 * Stands in for the UBS SSO redirect during local development: nothing below this gate renders
 * until an identity exists, and that identity then holds for the whole session (see auth/session).
 * A production build never gates — the SSO proxy has already authenticated the request by the time
 * the SPA loads, so DEV_SIGN_IN is false and children render straight through.
 */
export default function DevSignInGate({ children }: { children: ReactNode }) {
  const signedIn = useSyncExternalStore(subscribe, isSignedIn, isSignedIn)
  if (!DEV_SIGN_IN || signedIn) return <>{children}</>
  return <DevSignIn />
}

function DevSignIn() {
  const chooseIdentity = (user: User) => {
    signIn(user)
    // Attribute the Login audit entry to the identity that just signed in — the X-Auth-* headers
    // are already rebuilt from it by the time this request leaves.
    api.audit.login().catch(() => {})
  }

  return (
    <div className="signin">
      <section className="signin-card">
        <header className="signin-head">
          <div className="signin-head-name">{APP_TITLE}</div>
          <div className="signin-head-sub">{APP_SUBTITLE}</div>
        </header>
        <div className="signin-body">
          <h1 className="signin-heading">Sign in</h1>
          <p className="signin-lead">
            Local development stand-in for UBS SSO. Choose the identity this session runs as.
          </p>
          <ul className="signin-list">
            {USERS.map(user => (
              <li key={user.uuName}>
                <button type="button" className="signin-user" onClick={() => chooseIdentity(user)}>
                  <span className="avatar" style={{ background: ROLES[roleFromLabel(user.role)].color }}>
                    {user.initials}
                  </span>
                  <span className="signin-user-id">
                    <strong>{user.name}</strong>
                    <span>{user.email}</span>
                  </span>
                  <span className="signin-user-role">{user.role}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="signin-note">
            The selected identity is sent to pe-sub-api as <code>X-Auth-*</code> headers — the same
            headers the SSO proxy injects in production, where this screen does not appear.
          </p>
        </div>
      </section>
    </div>
  )
}
