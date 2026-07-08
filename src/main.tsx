import './index.css'
import { StrictMode } from 'react'
import { Provider } from 'react-redux'
import { createRoot } from 'react-dom/client'
import App from './App'
import { api } from './services/api'
import { store } from './store/configStore'

api.audit.login().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>
)
