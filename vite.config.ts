import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { ClientRequest, IncomingMessage, ServerResponse } from 'node:http'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('error', (_err: Error, _req: ClientRequest | IncomingMessage, res: ServerResponse) => {
            // pe-sub-api is not running — return 503 so the browser fetch() gets a
            // non-ok response and the service-layer catch() falls back to local data.
            if (!res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'API unavailable — using local fallback data' }))
            }
          })
        },
      },
    },
  },
})
