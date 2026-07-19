import { useEffect, useRef, useState } from 'react'
import { useApp, SCREENS } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'

const ROLE_COLOR: Record<string, string> = {
  'Analyst':                     'var(--navy)',
  'Account/Transaction Manager': 'var(--amber)',
  'Admin':                       'var(--blue)',
}

const PROTOTYPE_URL = import.meta.env.VITE_PROTOTYPE_URL
type Reachability = 'checking' | 'up' | 'down'

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
    screen, currentUser, setCurrentUser, users, navigate,
    setTargetFacility, setActiveSubmission, setActiveSubmissionId, setActiveFacilityId,
    reviewNotifications, notificationsLoading,
  } = useApp()
  const { canSwitchRole } = useAuth()
  const info = SCREENS[screen] ?? { title: screen, sub: '' }
  const apiState = useApiReachable()
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const notificationRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!notificationsOpen) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!notificationRef.current?.contains(event.target as Node)) setNotificationsOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNotificationsOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [notificationsOpen])

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
          {apiState === 'up' && PROTOTYPE_URL && (
            <button
              type="button"
              title={`Live — pe-sub-api is responding. Click to switch to the prototype (reloads this window at ${PROTOTYPE_URL}).`}
              onClick={() => { window.location.href = PROTOTYPE_URL }}
              style={{
                fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 10,
                background: '#e6f4ea', color: '#1e7e34', letterSpacing: '0.03em',
                whiteSpace: 'nowrap', border: 'none', cursor: 'pointer',
              }}
            >
              ● Live
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ textAlign: 'right', lineHeight: 1.3 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{currentUser.name}</div>
              <div style={{ fontSize: 10, color: ROLE_COLOR[currentUser.role] ?? 'var(--muted)', fontWeight: 600 }}>{currentUser.role}</div>
            </div>
            <div style={{ position: 'relative' }}>
              {canSwitchRole && (
                <select
                  aria-label="Switch user"
                  value={currentUser.name}
                  onChange={event => setCurrentUser(users.find(user => user.name === event.target.value))}
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                >
                  {users.map(user => (
                    <option key={user.name} value={user.name}>{user.initials} · {user.name} ({user.role})</option>
                  ))}
                </select>
              )}
              <div
                className="avatar"
                title={canSwitchRole ? `Switch user — ${currentUser.role}` : currentUser.role}
                style={{ background: ROLE_COLOR[currentUser.role] ?? 'var(--navy)', cursor: canSwitchRole ? 'pointer' : 'default', userSelect: 'none' }}
              >
                {currentUser.initials}
              </div>
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
