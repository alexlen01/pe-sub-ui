---
name: verify
description: Drive the pe-sub-ui React app in a real browser to observe a change end-to-end.
---

# Verifying pe-sub-ui changes

The UI is a Vite React SPA on **http://localhost:3000**, proxying `/api` to
pe-sub-api on **:3001**. It is context-driven (no URL routing) — you navigate by
clicking, not by changing the URL.

## Handle: Playwright driving system Edge (no browser download)

Playwright isn't a project dep. Install it in a scratch dir and drive **system
Edge** via the `msedge` channel so no browser download is needed:

```bash
cd <scratchpad>; npm i playwright
```
```js
import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
```

### Gotchas
- **Do NOT `waitUntil: 'networkidle'`** — TopBar polls `/api/ping` every 15s, so
  the network never idles and `goto` times out. Use `domcontentloaded` + explicit
  `waitFor` on elements.
- Sidebar nav items render `icon + label` in one node, so `getByText('Upload Agent
  BB', { exact: true })` fails. Use non-exact `getByText('Upload Agent BB')`.
- Highlighted "auto-mapped" cells carry class `td.auto-mapped-cell`; the "Auto"
  chip is `.auto-mapped-badge`. Count these to assert highlight state.

## Reaching the Run Shadow BB "LP Category & Rate Assignment" step (step 5)

Needs a submission at `wizardStep: 5`, status `Review`. Check first:
`GET :3001/api/submissions` → find one with `status=Review` and `wizardStep=5`.
- If one exists: Dashboard → its facility row → **View Submission ›** (jumps
  straight to `run-shadow-bb`). Or Upload screen → submissions table → detail
  panel → **View Submission**.
- If none exists: drive the wizard forward — extraction-preview → *Confirm & Run
  LP Matching* → match-queue (resolve all Pending, then *Commit Decisions*) →
  lands on `run-shadow-bb`. Both those buttons **persist writes**.

## SHARED BACKEND — check for concurrent use before writing

The backend DB is shared with whatever the human is doing in their own browser.
Before any persistent write (Commit Decisions, Abort, saving an LP record),
`GET :3001/api/submissions` twice a few seconds apart and compare `updatedAt` /
statuses. If submissions are changing on their own, a user is active — do NOT
drive persistent writes; you'll corrupt their session. Prefer an isolated
submission on an unused facility, or defer until idle.
