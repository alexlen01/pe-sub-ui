import { useEffect, useState } from 'react'
import { useApp, SCREENS } from '../../context/AppContext'

const ROLE_COLOR: Record<string, string> = {
  'Analyst':                    'var(--navy)',
  'Account/Transaction Manager': 'var(--amber)',
}

// The prototype is a separate application (pe-sub-platform) served on its own port. Selecting
// the Prototype segment navigates the current window to it, re-launching the prototype in place.
const PROTOTYPE_URL = 'http://localhost:5173'

type Reachability = 'checking' | 'up' | 'down'

// Poll pe-sub-api for reachability via the same-origin /api proxy (no CORS concern). "Live" means
// the API is *working* — it answers at all. A non-2xx response (the API up but erroring) still
// counts as up; only a network failure / connection-refused (the fetch itself rejecting) is down.
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
    check()
    const id = setInterval(check, 15_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])
  return state
}

export default function TopBar() {
  const { screen, currentUser } = useApp()
  const info     = SCREENS[screen] ?? { title: screen, sub: '' }
  const apiState = useApiReachable()

  // Selecting Prototype reloads in the same window onto the prototype app (re-launching :5173),
  // rather than opening a new tab.
  const switchToPrototype = () => { window.location.href = PROTOTYPE_URL }

  return (
    <header className="topbar">
      <div className="topbar-info">
        <div className="topbar-title">{info.title}</div>
        <div className="topbar-sub">{info.sub}</div>
      </div>
      <div className="topbar-right">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* The badge appears only while the app is Live (API reachable). Clicking it switches
              to the prototype, navigating this window to :5173. */}
          {apiState === 'up' && (
            <button
              type="button"
              title={`Live — pe-sub-api on :3001 is responding. Click to switch to the prototype (reloads this window at ${PROTOTYPE_URL}).`}
              onClick={switchToPrototype}
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
            <div className="avatar" style={{ background: ROLE_COLOR[currentUser.role] ?? 'var(--navy)' }}>
              {currentUser.initials}
            </div>
            {currentUser.notifications > 0 && (
              <div className="status-dot" title={`${currentUser.notifications} pending notifications`} />
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
