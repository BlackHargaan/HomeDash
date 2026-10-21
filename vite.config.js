import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Forward the API to a HomeDash server started with `npm run server` in a
    // second terminal. Without it, /api calls fail and the app falls back to
    // browser-only mode.
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: false },
    },
  },
  test: {
    // Server tests spin up real HTTP servers; give them room on slow CI.
    testTimeout: 15000,
  },
})
