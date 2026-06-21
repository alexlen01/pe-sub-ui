# pe-sub-ui

React / TypeScript / Vite frontend for the PE Sub Borrowing Base Platform.

## Stack

- React 18, TypeScript 5, Vite 6
- Domain types in `src/types/` (LP, Facility, BBResult, etc.)
- API calls proxied through Vite dev server to `pe-sub-api` on port 3001

## Prerequisites

- Node.js 20+
- `pe-sub-api` running on port 3001
- `pe-sub-extraction` running on port 3002 (required for Upload wizard)

## Getting started

```bash
npm install
npm run dev
```

App runs at `http://localhost:3000`.

## Other commands

```bash
npm run build              # production build (tsc + vite)
npm run typecheck          # tsc --noEmit
npm run clean              # delete dist/
npm run package            # bump patch version, build + create dist/pe-sub-ui-v<version>.tar.gz (PowerShell)
npm run package:sh         # same via bash
npm run generate:agent-bb  # generate public/Agent-BB-Blue-Owl-GP-Stakes-V-May-2026.xlsx for upload testing
```

## Live vs mock mode

The app detects whether `pe-sub-api` is reachable on startup. When the API is available all data is fetched live; otherwise the app falls back to static mock data so the UI can be developed and reviewed without a running backend. A status indicator in the top bar shows the current mode.

## Upload wizard

The main workflow is a five-step wizard:

1. **Upload** — select facility, agent bank, period, and file; optional notes
2. **Review Extraction** — verify canonical field mapping (13 matched columns, 1 unmatched); map or discard unrecognised columns; extracted LP table shows name, Agent LP classification (lifted from the agent column or group-header section rows), commitment, uncalled capital, AUM, S&P / Moody's, advance rate, BB contribution, % of BB, concentration limit; click any row for full field detail including NAV, Fitch, Transferee, Parent / Sponsor
3. **LP Match Queue** — review fuzzy name-match decisions for each extracted LP row. **Commit Decisions** persists the accepted LPs into LP Master (create new / update matched), deduped on `(facility, investor name)`
4. **LP Classification & Rate Assignment** (`RunShadowBB`) — edits the **persisted** LP records created in step 3 (live mode reads `api.lps.list({ facilityId })`, not the match queue). **Save** writes the classification & rate edits back to LP Master via `PATCH /api/lps/classification`
5. **Run Shadow BB** — computes and persists the BB snapshot from the saved LP records

## Dashboard

The Dashboard's main table is the **Agent Bank Summary** (Agent, Borrower, # LPs, Account Number,
Loan Amount, Maturity Date, Facility Status, Facility Status Date). Account Number / Loan Amount /
Maturity Date are facility inputs sourced from the facility record and edited on the **Facility
Edit** overlay in LP Master (persisted via `PATCH /api/facilities/{id}`). Facility Status / Status
Date reflect the internal workflow status.

Selecting a row populates the **LP Classification** donut (live LP class breakdown) and the
**Executive Summary**, whose figures (UBS / Agent BB, BB Delta, EAR, EAR Delta) come from the
latest persisted Shadow BB snapshot via `GET /api/bb/snapshots/{facilityId}/latest` — not from the
facility row. Facilities with no Shadow BB run yet show the "No Shadow BB this cycle" empty state.

## Project structure

```
src/
  components/     UI primitives (Button, Card, Modal, Tag, StepBar, etc.) and layout
  config/         Static configuration (wizard steps, classification options, advance rates)
  data/           Mock/seed data used in non-live mode
  hooks/          Shared React hooks (usePagination, useScreenMode)
  screens/        One folder per screen
    Dashboard/
    ExtractionPreview/
    FieldMapping/
    FacilityDetail/
    LPMaster/
    MatchQueue/
    RunShadowBB/
    ShadowBBResults/
    Upload/
  services/       API client (api.ts), domain service functions (facilityService, extractionService)
  types/          Domain types: LP, Facility, BBResult, etc.
  utils/          Fuzzy matching and formatting utilities
```

## Environment

No `.env` required for local development — the Vite proxy handles `/api` → `localhost:3001` automatically. See `.env.example` if you need to point at a remote API.
