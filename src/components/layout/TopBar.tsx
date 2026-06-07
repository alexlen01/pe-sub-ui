import { useApp, SCREENS } from '../../context/AppContext'
import type { ScreenMode } from '../../context/AppContext'

const ROLE_COLOR: Record<string, string> = {
  'Credit Officer': 'var(--navy)',
  'Supervisor':     'var(--amber)',
  'Admin':          'var(--blue)',
}

const MODE_STYLE: Record<ScreenMode, { bg: string; color: string; label: string }> = {
  live:      { bg: '#e6f4ea', color: '#1e7e34', label: '● Live'      },
  prototype: { bg: '#fff3cd', color: '#856404', label: '● Prototype' },
  detecting: { bg: 'var(--tbl)', color: 'var(--muted)', label: '○ Checking' },
}

const MODE_TITLE: Record<ScreenMode, string> = {
  live:      'Live — all data from API. Click to switch to Prototype.',
  prototype: 'Prototype — all data hardcoded. Click to switch to Live.',
  detecting: 'Checking API…',
}

export default function TopBar() {
  const { screen, currentUser, screenMode, setScreenMode } = useApp()
  const info      = SCREENS[screen] ?? { title: screen, sub: '' }
  const modeStyle = MODE_STYLE[screenMode]
  const clickable = screenMode !== 'detecting'

  function handleToggle() {
    if (screenMode === 'live')      setScreenMode('prototype')
    else if (screenMode === 'prototype') setScreenMode('live')
  }

  return (
    <header className="topbar">
      <div className="topbar-info">
        <div className="topbar-title">{info.title}</div>
        <div className="topbar-sub">{info.sub}</div>
      </div>
      <div className="topbar-right">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            title={MODE_TITLE[screenMode]}
            onClick={clickable ? handleToggle : undefined}
            style={{
              fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 10,
              background: modeStyle.bg, color: modeStyle.color, letterSpacing: '0.03em',
              whiteSpace: 'nowrap',
              cursor: clickable ? 'pointer' : 'default',
              userSelect: 'none',
            }}
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
