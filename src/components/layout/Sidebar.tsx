import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { NAV, APP_TITLE, APP_SUBTITLE, SCREEN_NAV_PARENT } from '../../config/navigationConfig'

export default function Sidebar() {
  const { screen, navigate, currentUser } = useApp()
  const { meta } = useAuth()
  const activeId = SCREEN_NAV_PARENT[screen] ?? screen
  const roleLabel = currentUser.role || meta.label

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-name">{APP_TITLE}</div>
        <div className="sidebar-logo-sub">{APP_SUBTITLE}</div>
      </div>
      <nav className="sidebar-nav">
        {NAV.map((item, i) => {
          if ('section' in item) return <div className="nav-section" key={i}>{item.section}</div>
          return (
            <div key={item.id} className={`nav-item ${activeId === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)}>
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </div>
          )
        })}
      </nav>
      <div className="sidebar-footer">
        {/* Real authenticated identity from /api/users/me; the role label falls back to the
            capability role's label when the server role string is empty. */}
        <div className="sidebar-user">{currentUser.name}</div>
        <div className="sidebar-role">{roleLabel}{currentUser.department && ` · ${currentUser.department}`}</div>
      </div>
    </aside>
  )
}
