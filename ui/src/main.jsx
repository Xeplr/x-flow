import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { configure, registerMTs, AccessProvider } from '@xeplr/ui-account'
import App from './App.jsx'
import './index.css'
import '@xeplr/ui-account/src/designs/theme.css'

// Auth requests are same-origin in dev — vite proxies /auth/api → AUTH_URL
// (see vite.config.js, which reads it from .env).
configure('')

// Mirrors @xeplr/workflow's db/setup.js's registerMTs() — same level keys, names and
// headers, kept in step by hand because there is no shared runtime package
// between the two processes. Get these out of sync and every request carries a
// header the server does not read, which reads as "not authorized" rather than
// as a typo.
registerMTs({
  l1: { name: 'companyId', header: 'x-company-id' },
  l2: { name: 'workspaceId', header: 'x-workspace-id' }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AccessProvider>
        <App />
      </AccessProvider>
    </BrowserRouter>
  </React.StrictMode>
)
