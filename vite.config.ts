import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl = (env.VITE_BACKEND_URL || env.BACKEND_URL || 'http://localhost:8010').replace(/\/+$/, '')

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
          target: backendUrl,
          changeOrigin: true,
        },
      },
    },
  }
})
