import './index.css'
import { StrictMode } from 'react'
import { Provider } from 'react-redux'
import { createRoot } from 'react-dom/client'
import App from './App'
import { api } from './services/api'
import { store } from './store/configStore'
import { installDevAuth } from './auth/installDevAuth'

// Must run before any API call so requests carry the dev-selected identity (local GATEWAY mode).
installDevAuth()

api.audit.login().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>
)
