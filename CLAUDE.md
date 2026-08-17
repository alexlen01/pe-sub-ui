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

### API status badge (TopBar)

`TopBar.tsx` shows a **read-only** `● Live` / `● Offline` badge. It polls `/api/ping` through the
same-origin `/api` proxy every 15s with a 2s-timeout `fetch`. "Live" means the API is *working* —
i.e. it answers at all. A non-2xx response (API up but erroring) still counts as reachable; only the
`fetch` itself rejecting (network failure / connection refused / timeout) is treated as not-live.

| API reachable | Behaviour |
|---|---|
| `up` | Green `.api-status-up` `● Live` pill |
| `down` | Red `.api-status-down` `● Offline` pill |
| `checking` | Badge is **not rendered** (first probe only) |

**The badge is an indicator, never a control.** It is a `<span>`, not a button: no click handler, no
navigation, no data-source toggle. Do not re-add a link to the prototype from it — the prototype app
is reached only by opening `http://localhost:5173` directly, and `VITE_PROTOTYPE_URL` no longer
exists.

---

## Identity — SSO-shaped, no in-app user switcher

Identity always arrives the way SSO delivers it: established **before** the app renders, fixed for
the session, and carried to the API as `X-Auth-*` headers. There is **no user or role dropdown in
the app chrome** — do not add one back.

- **Production**: the trusted UBS SSO proxy authenticates and injects the headers. `AuthContext`
  resolves the role from `GET /api/users/me`; the TopBar avatar opens a **display-only** account
  panel. The proxy strips client-supplied auth headers, so the SPA never sets them.
- **Local dev**: `components/auth/DevSignIn.tsx` gates the whole app until an identity from `USERS`
  (`config/navigationConfig.ts`) is signed in. **The gate is the default entry point of a browser
  session — no user is ever auto-selected.** `auth/session.ts` then holds that identity in a
  **session cookie** (`pe-sub-dev-session`), standing in for the cookie the SSO proxy sets after
  sign-on: it survives reloads and new tabs, and the browser drops it when the session ends.
  `auth/installDevAuth.ts` attaches its headers to every `/api` fetch. Switching user means
  **Sign out** → reload → gate, never an in-place toggle.

  Persist the session **only** with a cookie carrying no `Max-Age`/`Expires`. `localStorage` (the
  retired role switcher's `pe-sub-dev-user`) and `sessionStorage` outlive or fragment the browser
  session, which is how the gate silently stopped appearing and every run reopened as J. Smith.

**The capability role is derived from the identity, never selected separately.** `roleFromLabel` in
`auth/roles.ts` maps a display-role label to a `Role` token, and unknown labels collapse to `VIEWER`.
A `USERS` entry's `role` string must therefore match a `RoleMeta.label` exactly — if it drifts, that
user silently becomes read-only. `devSignIn.test.ts` pins this; keep it passing when touching either
file.

Nothing below the gate may assume an identity is absent: `AppProvider` mounts only once a user
exists locally, so no screen should defend against a missing `currentUser`.

---

### Service contract

- Service functions take no `live`/mode parameter — they always call the API.
- `templateService` fetches Agent-BB template profiles from `/api/bb-templates` and the field-alias
  dictionary from `/api/field-mapping/alias-groups`. Both are cached after the first call to
  `initTemplateService()`. Screens that use template data must call `initTemplateService()` in a
  `useEffect` and store results in local state via `getTemplateProfiles()`.

---

## Screens and Routing

Screen names are defined in `src/config/screenConfig.ts`. Navigation goes through `navigate(name)` from `useApp()` — never mutate `screen` directly.

### Rank display boundary

`rank` is facility-specific. In LP Master, display Rank in both the records table and LP Record
Entry panel when the user selects a facility first. Do not display Rank in either surface when the
user chooses **All Facilities**, because that path mixes records from different facilities. Rank
also remains visible in Shadow BB. Do not infer one global display rule from the presence of
`rank` on `LPRecord`; the LP Master boundary is `facFilter` (selected facility versus all facilities).

---

## Test Coverage

- Every screen that reads data must have a test asserting real field values render against a mocked API response (no hardcoded strings).
- Every service function must be tested with a mocked `fetch` response that mirrors the API contract.
- Never use `expect(screen.getByText('—'))` as a passing assertion — null/missing data must be tested with a known fixture.
