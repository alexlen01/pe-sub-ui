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

## API status indicator

The app is always live — every screen reads `pe-sub-api` through the same-origin `/api` proxy and
surfaces its own load error if a call fails; there is no in-app fallback to canned data. The TopBar
polls `/api/ping` every 15s (2s timeout) and shows a read-only badge: green **● Live** while the API
answers, red **● Offline** when the request itself fails (network error, connection refused,
timeout). Nothing renders during the first probe. The badge reports status only — it is not a
control, and switching data sources from it is not possible.

## Signing in

In production the trusted UBS SSO proxy authenticates the request before the SPA loads and injects
the identity as `X-Auth-User` / `X-Auth-First-Name` / `X-Auth-Last-Name` / `X-Auth-Email` /
`X-Auth-Roles`. The app never offers a user or role switcher there — the TopBar avatar opens an
account panel that only displays the authenticated identity from `GET /api/users/me`.

Local development stands in for that proxy with a **sign-in gate** (`components/auth/DevSignIn.tsx`).
It is where every browser session starts: no screen mounts and no API call fires until an identity
is chosen from `USERS` in `config/navigationConfig.ts`, and `auth/installDevAuth.ts` then attaches
the matching `X-Auth-*` headers to every `/api` request. The choice is held in a **session cookie**
(`pe-sub-dev-session`) that stands in for the one the SSO proxy sets after sign-on — it carries no
`Max-Age`/`Expires`, so the identity persists across reloads and new tabs but is discarded when the
browser session ends. No user is ever auto-selected, so a fresh session always starts at the gate
rather than reopening as a stale default. Each listed user's `role` string must match a `RoleMeta.label` in
`auth/roles.ts` — `roleFromLabel` derives the capability role (and the `X-Auth-Roles` value) from
it, and an unrecognised label collapses to the least-privileged `VIEWER`. To change user, open the
account panel and **Sign out**; the app reloads back to the gate so no state carries across
identities. The gate is compiled in for dev builds and when `VITE_DEV_SIGN_IN=true`, and is absent
from production builds.

`pe-sub-api` honours these headers in both of its security modes: GATEWAY trusts only them, and its
default DEV mode prefers them over its fixed dev identity (`js25029`), falling back to that identity
only for header-less callers such as service jobs, `curl`, and the reachability ping.

## Upload wizard

The main workflow is a five-step wizard:

1. **Upload** — select facility, agent bank, period, and file; optional notes
2. **Review Extraction** — verify canonical field mapping (13 matched columns, 1 unmatched); map or discard unrecognised columns; extracted LP table shows name, Agent LP classification (lifted from the agent column or group-header section rows), commitment, uncalled capital, AUM, S&P / Moody's, advance rate, BB contribution, % of BB, concentration limit; click any row for full field detail including NAV, Fitch, Transferee, Parent / Sponsor. When the Agent BB file maps a **Borrowing Base** column but no **% of Borrowing Base** column, the Agent BB % is calculated as each LP's `Borrowing Base ÷ total Borrowing Base`; those cells are highlighted (sky-blue with a **Calc** badge) and a notice above the table reports how many values were calculated
3. **LP Match Queue** — review fuzzy name-match decisions for each extracted LP row. **Commit Decisions** persists the accepted LPs into LP Master (create new / update matched), deduped on `(facility, investor name)`. The grid's **Ultimate Parent (To Be Applied)** column shows whose credit profile an Accept would actually apply: a matched feeder or SPV routes up to its sponsor, so ratings, LP category and advance rate come from that entity, not from the row matched. It reads **Self** when the match is already the ultimate entity, and `—` when there is no match (a new LP record, so nothing is applied). The Match Analysis panel repeats this as a **Parent Routing** block, and the resolution is re-run when an analyst overrides the match by hand. Server-side the rule is *child-first, ancestors fill gaps* — the matched record's own values always win, and the sponsor supplies only what the feeder leaves blank (see the pe-sub-api README). Accepting a match also records the uploaded spelling as a **known alias**, so the next upload of that exact string matches at 100% without fuzzy scoring
4. **LP Classification & Rate Assignment** (`RunShadowBB`) — edits the **persisted** LP records created in step 3 (live mode reads `api.lpRecords.list({ facilityId })`, not the match queue). **Save** writes the classification & rate edits back to LP Master via `PATCH /api/lpRecords/classification`. UBS LP Classifications are auto-populated: derived from Agent LP Category / investor profile / agent rate when the record has none, then **upgraded from LP Master data** when that strictly improves the BUSA rate (investment-grade S&P/Moody's/Fitch rating → `Rated`; AUM ≥ $2bn → `Unrated >2bn`; AUM $1–2bn → `Unrated 1–2bn`; `Excluded` is never overridden). An upgraded class also resets the LP's UBS Advance Rate to its tier default. An amber notice above the table reports how many classifications were derived/upgraded and that rates & concentration limits were pre-populated. Concentration limits resolve through the same fallback chain as the API engine: per-LP stored limit → class default (`CLS_CONC_LIMIT_DEFAULTS` from eligibility config, edited on the Config screen's **Per-LP Concentration Limit Defaults** card) → facility default. In the LP record detail form (`LPRecordPanel`), changing the **UBS LP Classification** auto-assigns the **UBS Concentration Limit** to that class default (the `Excluded` bucket is forced to `0.0%` first); entering a limit outside the class's accepted range (`CLS_CONC_LIMIT_BOUNDS` from eligibility config) shows a non-blocking "outside norm" warning under the field
5. **Run Shadow BB** — computes and persists the BB snapshot from the saved LP records. The
   run response's `result.breaches` (evaluated server-side against the Concentration Limits in
   Config) render as attention alerts under Calculation Results: a red box for breaches
   ("must resolve before submitting BB certificate to agent"), an amber box for warnings, and
   the primary action relabels to **Review Breaches in BB Results** while breaches exist

The **Shadow BB Results** screen is **server-rendered**: the grid joins the latest snapshot's
per-LP engine results (`getFacilityBBSnapshot` returns `{ summary, breaches, lps }`) with the live
LP records (input fields, rank), and every BB figure — per-row Agent/UBS BB, excess
concentrations, %-of-BB shares, footer totals, the 5-table summary (`GET /api/bb/summary-ext`),
and the breach verdict — comes from the server, frozen at the last run. The UI computes **nothing
authoritative**: `calcRow` and `computeLPRecord` survive only as instant previews of *unsaved*
edits (an edited row shows live preview values; an "Unsaved changes" banner explains that totals,
summary and breaches stay frozen until **Re-run Shadow BB**). The Run Shadow BB wizard step
likewise posts input fields only — `abb`/`ubb`/excess concentrations are no longer part of the
commit payload — and renders the run response's summary.

**↓ Export** writes a single-sheet workbook (`exceljs`) laid out like the screen: the four summary
tables (LP Portfolio, Borrowing Base, BUSA, Agent) side by side across the top in their on-screen
colours — each outlined in navy and separated by an empty gutter column — then the LP grid carrying
**every** column of the visible table, in screen order, for the rows currently sorted and filtered. Money is written in full dollars and percentages as fractions,
both with Excel number formats, so the sheet stays sortable and summable.

## LP Master Records

`LP Master` (`lp-master`) is the facility-scoped view: pick a facility, or **View All N LPs →** for
every facility's LP *records*. Alongside that button, **View Master N LP Records →** opens
`LPMasterRecords` (`lp-master-records`) — the bank-wide curated store those records are seeded
from. The two are deliberately siblings, not modes of one screen: LP Records are per-facility
outcomes carrying commitments and borrowing base, while LP Master rows are the upstream profiles
that *feed* them, so the columns stop at the credit profile and add the parent/child hierarchy
instead.

The facility picker itself is a table, not a tile grid, carrying the same Agent Bank Summary columns
as the Dashboard (Facility, Agent Bank, # LPs, Account #, Loan Amount, Maturity Date, Collateral
Date, Facility Status) plus **Last BB Run** last — an explicit run date, with the relative form
("2d ago") on hover, and a `◆ BB` marker for a facility carrying BB figures but no run timestamp.
Sorting runs on the underlying values, not the display strings, so dates order chronologically and
`# LPs` numerically. Column widths default wide enough for each header to sit on one line beside its
sort indicator, and the summed width is the table's minimum, so a narrow viewport scrolls
horizontally rather than squeezing columns. A leading pencil column (editors only) opens the
Facility Edit overlay; clicking anywhere else on the row drills into that facility's LP records.

The screen reuses the LP Records layout exactly — same `Card` + filter bar, dense sortable/resizable
table, pagination, and a right-docked editable panel (`LPMasterPanel` inside a `DraggablePanel`
using the same `.LPRecord-detail-overlay` class, so the same width and position). Columns cover the
subset that applies ratings and classifications to a matched row: Investor Name, Parent, Children,
SPV, Region, Investor Type, Institutional vs HNW, UBS LP Classification, Investment Grade,
S&P / Moody's / Fitch, LP Size + Size Measure, Funded Ratio, UBS Default Advance Rate, UBS Default
Concentration Limit, Notes. A **Hierarchy** filter narrows to ultimate entities, feeders & SPVs, or
sponsors with children.

There is deliberately **one** Parent column, not a Parent plus an Ultimate Parent: every chain in
the data is a single hop, so the two were identical on all 3,506 linked rows. The `ultimateParent`
field is still served and still used — by the panel, and by Review Matches, where it differs from
the *matched record* by construction. If a sponsor-of-sponsor ever appears, the Parent column grows
a depth affordance rather than the table regaining a permanently duplicated column.

The panel's **Hierarchy** section is the Parent/Child dependency: a sponsor picker (which excludes
the record itself and every descendant, since either choice would leave the chain with no ultimate
entity — the API rejects it too), the resolved Ultimate Parent, and the list of feeders routing to
this record. A feeder shows a note naming what it inherits; a `parent` string that matches no
LP Master record is flagged **⚠ Unlinked sponsor** in both the table and the panel, because nothing
is inherited from it. Known aliases are listed read-only. Save issues
`PUT /api/lp-master/{id}` (ANALYST-gated) and refetches, because a save can repoint other rows —
adopting children that already named this record, or renaming a sponsor its feeders display.

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
- **Ad Hoc Reporting** — `GET /api/lpRecords` with category filter and client-side sort; **Run & Export**
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
    LPMasterRecords/
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
