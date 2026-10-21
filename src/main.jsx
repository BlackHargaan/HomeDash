import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { DashboardProvider } from './context/DashboardContext.jsx'
import { SyncProvider } from './context/SyncContext.jsx'
import { ServerProvider } from './context/ServerContext.jsx'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import './styles/index.css'
import './styles/widgets.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ServerProvider>
      <DashboardProvider>
        <SyncProvider>
          <App />
        </SyncProvider>
      </DashboardProvider>
    </ServerProvider>
  </React.StrictMode>,
)
