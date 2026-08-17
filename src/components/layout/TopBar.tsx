import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { ROLES, roleFromLabel } from '../../auth/roles'
import { useApp, SCREENS } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'

type Reachability = 'checking' | 'up' | 'down'

// Closes a popover on outside click or Escape while it is open.
function useDismissOnOutside(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  setOpen: Dispatch<SetStateAction<boolean>>,
) {
  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [ref, open, setOpen])
}

function useApiReachable(): Reachability {
  const [state, setState] = useState<Reachability>('checking')
  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        await fetch('/api/ping', { signal: AbortSignal.timeout(2000) })
        if (!cancelled) setState('up')
      } catch {
        if (!cancelled) setState('down')
      }
    }
    void check()
    const id = setInterval(() => { void check() }, 15_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])
  return state
}

export default function TopBar() {
  const {
    screen, currentUser, navigate,
    setTargetFacility, setActiveSubmission, setActiveSubmissionId, setActiveFacilityId,
    reviewNotifications, notificationsLoading,
  } = useApp()
  const { devSignIn, signOut } = useAuth()
  const info = SCREENS[screen] ?? { title: screen, sub: '' }
  const apiState = useApiReachable()
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const notificationRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const roleColor = ROLES[roleFromLabel(currentUser.role)].color

  useDismissOnOutside(notificationRef, notificationsOpen, setNotificationsOpen)
  useDismissOnOutside(userMenuRef, userMenuOpen, setUserMenuOpen)

  const openNotification = (index: number) => {
    const notification = reviewNotifications[index]
    if (!notification) return
    setActiveFacilityId(notification.facilityId)
    setTargetFacility(notification.facilityName)
    if (notification.submission) {
      setActiveSubmission(notification.facilityName)
      setActiveSubmissionId(notification.submission.id)
    }
    navigate(notification.kind === 'approval'
      ? 'shadow-bb'
      : notification.kind === 'changes-requested'
        ? 'run-shadow-bb'
        : 'lp-master')
    setNotificationsOpen(false)
  }

  return (
    <header className="topbar">
      <div className="topbar-info">
        <div className="topbar-title">{info.title}</div>
        <div className="topbar-sub">{info.sub}</div>
      </div>
      <div className="topbar-right">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {apiState !== 'checking' && (
            <span
              className={`api-status api-status-${apiState}`}
              title={apiState === 'up'
                ? 'Live — pe-sub-api is responding.'
                : 'Offline — pe-sub-api is not responding. Screens will show their own load errors.'}
            >
              ● {apiState === 'up' ? 'Live' : 'Offline'}
            </span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ textAlign: 'right', lineHeight: 1.3 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{currentUser.name}</div>
              <div style={{ fontSize: 10, color: roleColor, fontWeight: 600 }}>{currentUser.role}</div>
            </div>
            {/* The account menu is informational in production — only the local dev session, whose
                identity came from the sign-in gate rather than SSO, can be ended from here. */}
            <div className="user-menu" ref={userMenuRef}>
              <button
                type="button"
                className="avatar user-menu-trigger"
                aria-label={`Account — ${currentUser.name}, ${currentUser.role}`}
                aria-expanded={userMenuOpen}
                aria-haspopup="dialog"
                onClick={() => setUserMenuOpen(open => !open)}
                style={{ background: roleColor }}
              >
                {currentUser.initials}
              </button>
              {userMenuOpen && (
                <section className="user-panel" role="dialog" aria-label="Account">
                  <div className="user-panel-id">
                    <div className="avatar" style={{ background: roleColor }}>{currentUser.initials}</div>
                    <div>
                      <strong>{currentUser.name}</strong>
                      <span>{currentUser.email}</span>
                    </div>
                  </div>
                  <dl className="user-panel-meta">
                    <div><dt>User ID</dt><dd>{currentUser.uuName}</dd></div>
                    <div><dt>Role</dt><dd>{currentUser.role}</dd></div>
                    <div><dt>Department</dt><dd>{currentUser.department || '—'}</dd></div>
                  </dl>
                  {devSignIn ? (
                    <div className="user-panel-actions">
                      <button type="button" className="user-panel-signout" onClick={signOut}>
                        Sign out
                      </button>
                      <p>Local development session. Identity is sent as <code>X-Auth-*</code> headers; in production it comes from UBS SSO.</p>
                    </div>
                  ) : (
                    <div className="user-panel-actions">
                      <p>Signed in through UBS SSO. Sign out from your UBS session to change user.</p>
                    </div>
                  )}
                </section>
              )}
            </div>
            <div className="notification-center" ref={notificationRef}>
              <button
                type="button"
                className="notification-trigger"
                aria-label={reviewNotifications.length > 0
                  ? `${reviewNotifications.length} messages pending your review`
                  : 'No messages pending your review'}
                aria-expanded={notificationsOpen}
                aria-haspopup="dialog"
                onClick={() => setNotificationsOpen(open => !open)}
              >
                <span aria-hidden="true">&#128276;</span>
                {reviewNotifications.length > 0 && <span className="notification-badge">{reviewNotifications.length}</span>}
              </button>
              {notificationsOpen && (
                <section className="notification-panel" role="dialog" aria-label="Messages pending review">
                  <div className="notification-panel-header">
                    <strong>Pending review</strong>
                    <span>{reviewNotifications.length}</span>
                  </div>
                  {notificationsLoading && reviewNotifications.length === 0 ? (
                    <div className="notification-empty">Checking for messages&hellip;</div>
                  ) : reviewNotifications.length === 0 ? (
                    <div className="notification-empty">
                      <strong>You are all caught up</strong>
                      <span>There are no messages requiring your review.</span>
                    </div>
                  ) : (
                    <div className="notification-list">
                      {reviewNotifications.map((notification, index) => (
                        <article className="notification-item" key={notification.id}>
                          <div className={`notification-kind notification-kind-${notification.kind}`} aria-hidden="true" />
                          <div>
                            <strong>{notification.title}</strong>
                            <p>{notification.detail}</p>
                            <button type="button" onClick={() => openNotification(index)}>
                              {notification.actionLabel} &rsaquo;
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
