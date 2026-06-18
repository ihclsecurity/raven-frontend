/**
 * Frontend Bootstrap
 *
 * This file is the browser entry point for the React application. It mounts
 * the root tree once, wires up the global providers, and loads the shared
 * stylesheet that all pages inherit.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Start here only when you want to understand startup order. The important
 * logic in this file is not business behavior; it is the provider stack and
 * the fact that the app cannot render before the root node exists.
 *
 * What this file is responsible for
 * ----------------------------------
 * - creating the shared React Query client
 * - mounting the auth provider before route rendering
 * - enabling browser routing for the app shell
 * - importing the global CSS once at startup
 *
 * What this file does not do
 * --------------------------
 * - it does not define page workflows
 * - it does not fetch application data directly
 * - it does not contain page-specific rendering logic
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { AuthGate, AuthProvider } from './auth/AuthContext'
import './index.css'

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AuthGate>
            <App />
          </AuthGate>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
