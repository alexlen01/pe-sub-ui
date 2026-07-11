/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import type { ClientRequest, IncomingMessage, ServerResponse } from 'node:http'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_API_PROXY_TARGET
  if (!proxyTarget && command === 'serve' && mode !== 'test') throw new Error(`VITE_API_PROXY_TARGET is required for mode '${mode}'`)
  return ({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
  },
  server: {
    port: env.VITE_DEV_PORT ? Number(env.VITE_DEV_PORT) : undefined,
    proxy: proxyTarget ? {
      '/api': {
        target: proxyTarget,
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
    } : undefined,
  },
  })
})
