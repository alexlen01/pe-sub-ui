// Dev-only: transparently attach the signed-in identity's headers to every same-origin /api
// request, so a locally GATEWAY-mode pe-sub-api authorizes the SPA as that user. Installed once at
// startup. A no-op in production builds — there the SSO proxy is the identity source and injecting
// client headers would be both pointless (stripped by the proxy) and a spoof vector.
//
// A global fetch wrapper is used deliberately: it covers every call site (api.ts, the service
// modules, and the RTK config store) without threading auth through each one.

import { DEV_SIGN_IN, getAuthHeaders } from './session'

export function installDevAuth(): void {
  if (!DEV_SIGN_IN || typeof window === 'undefined') return

  const original = window.fetch.bind(window)

  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string' ? input
      : input instanceof URL ? input.toString()
      : input.url

    // Same-origin API only. EventSource (SSE) can't carry headers and hits public endpoints,
    // so it is unaffected.
    if (url.startsWith('/api')) {
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      )
      for (const [key, value] of Object.entries(getAuthHeaders())) headers.set(key, value)
      return original(input, { ...init, headers })
    }
    return original(input, init)
  }
}
