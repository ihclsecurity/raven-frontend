import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const configuredBackendUrl = (env.VITE_BACKEND_URL || env.BACKEND_URL || '').replace(/\/+$/, '')
  if (mode !== 'development' && !configuredBackendUrl) {
    throw new Error('Missing VITE_BACKEND_URL for non-development build')
  }
  const backendUrl = configuredBackendUrl || (mode === 'development' ? 'http://localhost:8010' : '')
  const proxyTarget = configuredBackendUrl || 'http://localhost:8010'

  return {
    define: {
      __APP_BACKEND_URL__: JSON.stringify(backendUrl),
    },
    plugins: [react()],
    server: {
      port: 3000,
      allowedHosts: ['d7ca-115-117-121-234.ngrok-free.app'],
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
