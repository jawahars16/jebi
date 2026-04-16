import ReactDOM from 'react-dom/client'
import App from './App'
import { SessionStoreProvider } from './hooks/useSessionStore.jsx'
import { PreferencesProvider } from './hooks/usePreferences'
import './styles/global.css'

// StrictMode intentionally double-invokes effects in dev, which opens two
// WebSocket connections and spawns two shells. Removed until we have a
// reconnect/singleton guard in useTerminal.
ReactDOM.createRoot(document.getElementById('root')).render(
  <SessionStoreProvider>
    <PreferencesProvider>
      <App />
    </PreferencesProvider>
  </SessionStoreProvider>
)
