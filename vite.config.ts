/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { ClientRequest, IncomingMessage, ServerResponse } from 'node:http'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq: ClientRequest, req: IncomingMessage) => {
            const clientIp = req.socket.remoteAddress ?? '127.0.0.1'
            proxyReq.setHeader('X-Forwarded-For', clientIp)
          })
          proxy.on('error', (_err: Error, _req: ClientRequest | IncomingMessage, res: ServerResponse) => {
            // pe-sub-api is not running or reset the connection mid-response.
            // Always write a JSON body so the browser never receives a 200 with empty body
            // (which causes "SyntaxError: Unexpected end of JSON input" in fetch().json()).
            if (!res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' })
            }
            res.end(JSON.stringify({ error: 'API unavailable — using local fallback data' }))
          })
        },
      },
    },
  },
})
