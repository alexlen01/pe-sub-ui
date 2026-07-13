// Dev-only: transparently attach the selected role's identity headers to every same-origin /api
// request, so a locally GATEWAY-mode pe-sub-api authorizes the SPA as the chosen role. Installed
// once at startup. A no-op in production builds — there the SSO proxy is the identity source and
// injecting client headers would be both pointless (stripped by the proxy) and a spoof vector.
//
// A global fetch wrapper is used deliberately: it covers every call site (api.ts, the service
// modules, and the RTK config store) without threading auth through each one.

import { DEV_ROLE_SWITCHER, getAuthHeaders } from './session'

export function installDevAuth(): void {
  if (!DEV_ROLE_SWITCHER || typeof window === 'undefined') return

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
