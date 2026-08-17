import { Suspense, lazy, type JSX } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import { AuthProvider } from './context/AuthContext'
import DevSignInGate from './components/auth/DevSignIn'
import Sidebar from './components/layout/Sidebar'
import TopBar  from './components/layout/TopBar'
import Toast   from './components/ui/Toast'

const Dashboard          = lazy(() => import('./screens/Dashboard'))
const Upload             = lazy(() => import('./screens/Upload'))
const LPMaster           = lazy(() => import('./screens/LPMaster'))
const LPMasterRecords    = lazy(() => import('./screens/LPMasterRecords'))
const ShadowBB           = lazy(() => import('./screens/ShadowBB'))
const Reports            = lazy(() => import('./screens/Reports'))
const Configuration      = lazy(() => import('./screens/Configuration'))
const AuditTrail         = lazy(() => import('./screens/AuditTrail'))
const MatchThresholds    = lazy(() => import('./screens/MatchThresholds'))
const ExtractionPreview  = lazy(() => import('./screens/ExtractionPreview'))
const MatchQueue         = lazy(() => import('./screens/MatchQueue'))
const RunShadowBB        = lazy(() => import('./screens/RunShadowBB'))
const FieldMapping       = lazy(() => import('./screens/FieldMapping'))
const BBTemplates        = lazy(() => import('./screens/BBTemplates'))

const SCREEN_MAP: Record<string, JSX.Element> = {
  dashboard:            <Dashboard />,
  upload:               <Upload />,
  'lp-master':          <LPMaster />,
  'lp-master-records':  <LPMasterRecords />,
  'shadow-bb':          <ShadowBB />,
  reports:              <Reports />,
  configuration:        <Configuration />,
  audit:                <AuditTrail />,
  'match-thresholds':   <MatchThresholds />,
  'extraction-preview': <ExtractionPreview />,
  'match-queue':        <MatchQueue />,
  'run-shadow-bb':      <RunShadowBB />,
  'field-mapping':      <FieldMapping />,
  'bb-templates':       <BBTemplates />,
}

function ScreenRouter() {
  const { screen } = useApp()

  return (
    <Suspense fallback={<div style={{ padding: 32, color: 'var(--muted)', fontSize: 13 }}>Loading…</div>}>
      {SCREEN_MAP[screen] ?? SCREEN_MAP.dashboard}
    </Suspense>
  )
}

export default function App() {
  return (
    <AuthProvider>
      {/* Locally, nothing below renders until an identity is signed in — no screen mounts (and no
          API call fires) without one, matching an SSO-protected app. Transparent in production. */}
      <DevSignInGate>
        <AppProvider>
          <div className="shell">
            <Sidebar />
            <div className="main">
              <TopBar />
              <div className="content">
                <ScreenRouter />
              </div>
            </div>
          </div>
          <Toast />
        </AppProvider>
      </DevSignInGate>
    </AuthProvider>
  )
}
