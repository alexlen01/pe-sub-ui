# pe-sub-ui — Project Rules

React 18 / TypeScript 5 / Vite 6. Dev server: http://localhost:3000.

State is managed via **React Context** (`src/context/AppContext.tsx`). There is no Redux store in this project.

---

## Live-only — no in-app Prototype mode

**This UI is always Live. It has no internal "prototype" data mode.** There is no `screenMode`,
no `useScreenMode`, and no `if (!live)` fallback to hardcoded data. Every screen fetches from the
real API via the service functions in `src/services/`. If the API is unavailable, screens surface
their own `loadError` state — they must **not** silently fall back to canned data.

The prototype lives entirely in the **separate `pe-sub-platform` app on `http://localhost:5173`**.
The two applications are fully separate; nothing in `pe-sub-ui` imports prototype data.

### Live badge (TopBar)

`TopBar.tsx` shows a **single `● Live` badge, rendered only while the app is Live** (the API is
reachable). It polls `/api/ping` through the same-origin `/api` proxy every 15s with a 2s-timeout
`fetch`. "Live" means the API is *working* — i.e. it answers at all. A non-2xx response (API up
but erroring) still counts as reachable; only the `fetch` itself rejecting (network failure /
connection refused / timeout) is treated as not-live.

| API reachable | Behaviour |
|---|---|
| `up` | Green `#e6f4ea`/`#1e7e34` `● Live` pill; **clickable** |
| `down` / `checking` | Badge is **not rendered** |

Clicking the Live badge switches to the prototype: it sets `window.location.href` to
`http://localhost:5173`, reloading the **same window** onto the prototype app (re-launching it in
place — not a new tab). It does not toggle `pe-sub-ui`'s own data source; the UI stays Live until
navigated away.

### Service contract

- Service functions take no `live`/mode parameter — they always call the API.
- The only client-resident datasets that remain are `src/data/templateProfiles.ts` and
  `src/data/fieldMappingData.ts`, used by `templateService` for client-side Agent-BB format
  recognition (no UI-reachable backend endpoint exists yet — migrate when one does).

---

## Screens and Routing

Screen names are defined in `src/config/screenConfig.ts`. Navigation goes through `navigate(name)` from `useApp()` — never mutate `screen` directly.

---

## Test Coverage

- Every screen that reads data must have a test asserting real field values render against a mocked API response (no hardcoded strings).
- Every service function must be tested with a mocked `fetch` response that mirrors the API contract.
- Never use `expect(screen.getByText('—'))` as a passing assertion — null/missing data must be tested with a known fixture.
