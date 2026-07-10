import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Local dev only: on Vercel, the dashboard and /api functions deploy as one
      // project (same origin), so this proxy is what makes `/api/*` work while
      // running `vite dev` against a separately-running `npm run dev:api`.
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
})
