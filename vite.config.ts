import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const configuredBackendUrl = (env.VITE_BACKEND_URL || env.BACKEND_URL || '').replace(/\/+$/, '')
  if (mode !== 'development' && !configuredBackendUrl) {
    throw new Error('Missing VITE_BACKEND_URL for non-development build')
  }

  // For Production
  const backendUrl = configuredBackendUrl;

  // For Development
  // const backendUrl = configuredBackendUrl || (mode === 'development' ? 'http://localhost:8010' : '');

  return {
    define: {
      __APP_BACKEND_URL__: JSON.stringify(backendUrl),
    },
    plugins: [
      react(),
      // mode === 'production' && obfuscatorPlugin({
      //   exclude: [/node_modules/],
      //   include: ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.js', 'src/**/*.jsx'],
      //   options: {
      //     debugProtection: true,
      //     deadCodeInjection: true,
      //     disableConsoleOutput: true,
      //     selfDefending: true,
      //     controlFlowFlattening: true,
      //     stringArray: true,
      //     stringArrayThreshold: 0.5
      //   }
      // })
    ],
    build: {
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[hash].js',
          chunkFileNames: 'assets/[hash].js',
          assetFileNames: 'assets/[hash][extname]',
        },
      },
    },
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
        },
      },
    },
  }
})
