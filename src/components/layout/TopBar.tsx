import { useApp, SCREENS } from '../../context/AppContext'

const ROLE_COLOR: Record<string, string> = {
  'Credit Officer': 'var(--navy)',
  'Supervisor':     'var(--amber)',
  'Admin':          'var(--blue)',
}

export default function TopBar() {
  const { screen, currentUser } = useApp()
  const info = SCREENS[screen] ?? { title: screen, sub: '' }

  return (
    <header className="topbar">
      <div className="topbar-info">
        <div className="topbar-title">{info.title}</div>
        <div className="topbar-sub">{info.sub}</div>
      </div>
      <div className="topbar-right">
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
    </header>
  )
}
