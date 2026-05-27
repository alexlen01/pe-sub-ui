import { useState } from 'react'
import { AppProvider } from './context/AppContext'

type Screen = 'dashboard' | 'lp-master' | 'shadow-bb' | 'reports'

export default function App() {
  const [screen, setScreen] = useState<Screen>('dashboard')

  return (
    <AppProvider>
      <div style={{ fontFamily: 'system-ui, sans-serif' }}>
        <nav style={{ padding: '12px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 16 }}>
          {(['dashboard', 'lp-master', 'shadow-bb', 'reports'] as Screen[]).map(s => (
            <button
              key={s}
              onClick={() => setScreen(s)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontWeight: screen === s ? 700 : 400,
                color: screen === s ? '#1e3a5f' : '#6b7280',
              }}
            >
              {s.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </button>
          ))}
        </nav>
        <main style={{ padding: 24 }}>
          <p style={{ color: '#6b7280', fontSize: 14 }}>
            Screen: <strong>{screen}</strong> — to be implemented.
          </p>
        </main>
      </div>
    </AppProvider>
  )
}
