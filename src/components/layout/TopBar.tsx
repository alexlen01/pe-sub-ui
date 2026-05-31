import { useApp, SCREENS } from '../../context/AppContext'
import { useApiMode } from '../../hooks/useApiMode'

const ROLE_COLOR: Record<string, string> = {
  'Credit Officer': 'var(--navy)',
  'Supervisor':     'var(--amber)',
  'Admin':          'var(--blue)',
}

const MODE_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  live:      { bg: '#e6f4ea', color: '#1e7e34', label: '● Live'      },
  prototype: { bg: '#fff3cd', color: '#856404', label: '● Prototype' },
  unknown:   { bg: 'var(--tbl)', color: 'var(--muted)', label: '○ Checking' },
}

export default function TopBar() {
  const { screen, currentUser } = useApp()
  const apiMode = useApiMode()
  const info = SCREENS[screen] ?? { title: screen, sub: '' }
  const modeStyle = MODE_STYLE[apiMode]

  return (
    <header className="topbar">
      <div className="topbar-info">
        <div className="topbar-title">{info.title}</div>
        <div className="topbar-sub">{info.sub}</div>
      </div>
      <div className="topbar-right">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            title={apiMode === 'prototype' ? 'API unavailable — showing prototype data' : apiMode === 'live' ? 'Connected to live API' : 'Checking API…'}
            style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 10, background: modeStyle.bg, color: modeStyle.color, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}
          >
            {modeStyle.label}
          </div>
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
