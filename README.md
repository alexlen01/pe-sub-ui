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

## Container image

`Dockerfile` builds the SPA and serves it with unprivileged nginx (non-root, port 8080).
`nginx.conf` proxies `/api` to the `pe-sub-api` Kubernetes service, so the same-origin `/api`
convention (and the TopBar Live badge's `/api/ping` poll) works in-cluster exactly as it does
under the Vite dev proxy. Deployment manifests live in `pe-sub-infra` (`k8s/base/ui/`).

```bash
docker build -t pe-sub-ui:latest .
```

## Live vs mock mode

The app detects whether `pe-sub-api` is reachable on startup. When the API is available all data is fetched live; otherwise the app falls back to static mock data so the UI can be developed and reviewed without a running backend. A status indicator in the top bar shows the current mode.

## Upload wizard

The main workflow is a five-step wizard:

1. **Upload** — select facility, agent bank, period, and file; optional notes
2. **Review Extraction** — verify canonical field mapping (13 matched columns, 1 unmatched); map or discard unrecognised columns; extracted LP table shows name, Agent LP classification (lifted from the agent column or group-header section rows), commitment, uncalled capital, AUM, S&P / Moody's, advance rate, BB contribution, % of BB, concentration limit; click any row for full field detail including NAV, Fitch, Transferee, Parent / Sponsor
3. **LP Match Queue** — review fuzzy name-match decisions for each extracted LP row. **Commit Decisions** persists the accepted LPs into LP Master (create new / update matched), deduped on `(facility, investor name)`
4. **LP Classification & Rate Assignment** (`RunShadowBB`) — edits the **persisted** LP records created in step 3 (live mode reads `api.lps.list({ facilityId })`, not the match queue). **Save** writes the classification & rate edits back to LP Master via `PATCH /api/lps/classification`
5. **Run Shadow BB** — computes and persists the BB snapshot from the saved LP records. The
   run response's `result.breaches` (evaluated server-side against the Concentration Limits in
   Config) render as attention alerts under Calculation Results: a red box for breaches
   ("must resolve before submitting BB certificate to agent"), an amber box for warnings, and
   the primary action relabels to **Review Breaches in BB Results** while breaches exist

The **Shadow BB Results** screen shows the same persisted breach verdict above the LP table:
collapsible red (breach) and amber (warning) panels listing rule, detail, and actual vs configured
limit, sourced from the latest snapshot via `getFacilityBBSnapshot` (which returns
`{ summary, breaches }`). The panels hide while local overrides are active, since the stored
verdict no longer matches the recomputed table.

## Dashboard

The Dashboard's main table is the **Agent Bank Summary** (Agent, Borrower, # LPs, Account Number,
Loan Amount, Maturity Date, Collateral Date, Facility Status, Facility Status Date). Account Number / Loan Amount /
Maturity Date / Collateral Date are facility inputs sourced from the facility record and edited on the **Facility
Edit** overlay in LP Master (persisted via `PATCH /api/facilities/{id}`). The overlay makes **all**
facility fields editable, including the Identity fields **Borrower (name)** and **Agent Bank** (# LPs
and Facility Status Date stay read-only — they are derived). It also lets a facility with **no LP
records** be **Deactivated** (`PATCH /api/facilities/{id}/status` → `Inactive`, reversible via
**Reactivate**) or **Deleted** (`DELETE /api/facilities/{id}`); both actions are disabled while LP
records exist. Facility Status / Status Date reflect the internal workflow status.

Selecting a row populates the **LP Classification** donut (live LP class breakdown) and the
**Executive Summary**, whose figures (UBS / Agent BB, BB Delta, EAR, EAR Delta) come from the
latest persisted Shadow BB snapshot via `GET /api/bb/snapshots/{facilityId}/latest` — not from the
facility row. Facilities with no Shadow BB run yet show the "No Shadow BB this cycle" empty state.

## Reports

The Reports screen is fully live — every tab reads persisted data via `src/services/reportService.ts`;
nothing is recomputed client-side and there is no canned preview data.

- **Collateral & Coverage** — the BB certificate. Facility and snapshot dropdowns are populated from
  `GET /api/facilities` and `GET /api/bb/snapshots/{facilityId}`; **Generate Certificate** fetches
  `GET /api/reports/collateral/{facilityId}?snapshotId=` and renders the certificate (summary metrics,
  LP category breakdown, and the optional sections — coverage trend, concentration analysis,
  reclassified LPs, quality breakdown — all built from the selected snapshot). Detail level and
  "Include LPs" control the LP drill-down table. **Download XLSX** exports the certificate
  (Summary / LP Categories / LPs sheets) via the `xlsx` package.
- **Effective Advance Rates** — `GET /api/reports/ear/{facilityId}`: one row per Shadow BB run.
- **Agent Bank Exposure** — `GET /api/reports/agent-banks`, optionally filtered to one bank.
- **Concentration Exposures** — `GET /api/reports/concentration/{facilityId}` per selected facility
  (or every facility, skipping those without a snapshot); the test checkboxes filter breach types.
- **Ad Hoc Reporting** — `GET /api/lps` with category filter and client-side sort; **Run & Export**
  downloads the result as XLSX immediately.
- **Scheduled Reports** — read-only list from `GET /api/config/reports`.

Each successful generation is recorded via `POST /api/reports/history` and the **Report History**
card (shown with the certificate preview) lists `GET /api/reports/history`.

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
