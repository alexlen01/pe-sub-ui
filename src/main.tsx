import './index.css'
import { StrictMode } from 'react'
import { Provider } from 'react-redux'
import { createRoot } from 'react-dom/client'
import App from './App'
import { api } from './services/api'
import { store } from './store/configStore'
import { installDevAuth } from './auth/installDevAuth'
import { DEV_SIGN_IN, isSignedIn } from './auth/session'

// Must run before any API call so requests carry the signed-in identity (local GATEWAY mode).
installDevAuth()

// In production the SSO proxy has already authenticated the request, so the session starts here.
// Locally there may be no identity yet — the sign-in gate records the Login audit entry once one is
// chosen; a session resumed from the session cookie is already signed in and logs it now.
if (!DEV_SIGN_IN || isSignedIn()) api.audit.login().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>
)
