import React from 'react'
import ReactDOM from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import './styles/global.css'
import App from './App'
import { LaunchProfilesProvider } from './state/LaunchProfiles'
import { AppStateProvider } from './state/AppState'
import { TerminalsProvider } from './state/Terminals'
import { SessionProvider } from './state/Session'
import { ToastProvider } from './components/Toast'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ToastProvider>
      <AppStateProvider>
        <TerminalsProvider>
          <SessionProvider>
            <LaunchProfilesProvider><App /></LaunchProfilesProvider>
          </SessionProvider>
        </TerminalsProvider>
      </AppStateProvider>
    </ToastProvider>
  </React.StrictMode>
)
