# pe-sub-ui

React / TypeScript / Vite frontend for the PE Sub Borrowing Base Platform.

## Stack

- React 18, TypeScript 6, Vite 8, Vitest
- Domain types in `src/types/` (LP, Facility, BBResult, etc.)
- State via **React Context** (`src/context/AppContext.tsx`, `AuthContext.tsx`); Redux Toolkit is
  used for exactly one thing — the shared configuration cache (`src/store/configStore.ts`)
- `exceljs` / `xlsx` for the Shadow BB and report exports
- API calls proxied through the Vite dev server to `pe-sub-api` on port 3001

## Prerequisites

- Node.js 20+
- `pe-sub-api` running on port 3001
- `pe-sub-extraction` running on port 3002 (required for the Upload wizard)

## Getting started

```bash
npm install
npm run dev
```

App runs at `http://localhost:3000`.

`npm run dev` loads `.env.development`, which sets `VITE_DEV_PORT=3000` and
`VITE_API_PROXY_TARGET=http://localhost:3001`. **`VITE_API_PROXY_TARGET` is required** — the Vite
config throws at startup if it is missing for a `serve` mode other than `test`, rather than silently
starting a dev server whose `/api` calls go nowhere.

## Other commands

```bash
npm test                   # vitest run (src/__tests__)
npm run build              # production build (tsc + vite)
npm run typecheck          # tsc --noEmit
npm run clean              # delete dist/
npm run package            # bump patch version, build + create dist/pe-sub-ui-v<version>.tar.gz (PowerShell)
npm run package:sh         # same via bash
npm run generate:agent-bb  # generate public/Agent-BB-Blue-Owl-GP-Stakes-V-May-2026.xlsx for upload testing
```

## Container image

`Dockerfile` builds the SPA (Node 24) and serves it with unprivileged nginx (non-root, port 8080).
`nginx.template.conf` is installed as an nginx config template and proxies `/api` to
`${PE_SUB_API_UPSTREAM}`, substituted at container start — so the same-origin `/api` convention (and
the TopBar Live badge's `/api/ping` poll) works in-cluster exactly as it does under the Vite dev
proxy. The template raises `client_max_body_size` to 50m and the read timeout to 1h, because a large
Agent BB upload and its extraction are legitimately slow. `GET /healthz` is the container probe.
Deployment manifests live in `pe-sub-infra` (`k8s/base/ui/`).

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
rather than reopening as a stale default. Each listed user's `role` string must match a
`RoleMeta.label` in `auth/roles.ts` — `roleFromLabel` derives the capability role (and the
`X-Auth-Roles` value) from it, and an unrecognised label collapses to the least-privileged `VIEWER`.
To change user, open the account panel and **Sign out**; the app reloads back to the gate so no state
carries across identities. The gate is compiled in for dev builds and when `VITE_DEV_SIGN_IN=true`,
and is absent from production builds.

`pe-sub-api` honours these headers in both of its security modes: GATEWAY trusts only them, and its
default DEV mode prefers them over its fixed dev identity (`js25029`), falling back to that identity
only for header-less callers such as service jobs, `curl`, and the reachability ping.

## Roles and capabilities

`auth/roles.ts` maps the three Spring role tokens to a capability set, and `useAuth().can(...)` gates
the affordances. **UI gating is usability only** — every permission is enforced server-side by
`pe-sub-api`; a disabled button here mirrors a server decision, it never *is* the decision.

| Capability | Analyst | Manager | Viewer |
|---|:--:|:--:|:--:|
| `upload` — upload Agent BB, run extraction / matching | ✓ | ✓ | |
| `runShadowBB` — run / recalculate and submit for review | ✓ | ✓ | |
| `reviewShadowBB` — accept or reject a completed Shadow BB | | ✓ | |
| `editConfig` — configuration, thresholds, mappings, templates | ✓ | | |
| `editLp` — LP records / LP Master classification | ✓ | ✓ | |
| `delete` — delete records | ✓ | ✓ | |
| `download` — export / download reports | ✓ | ✓ | ✓ |

An Analyst operates and configures but performs no independent review of any work; a Manager
operates and reviews but does not edit configuration. Intra ID App Roles map straight across:
`APP_ANALYST` → `ANALYST`, `APP_MANAGER` → `MANAGER`, `APP_VIEWER` → `VIEWER`.

## Screens and navigation

Screen names live in `src/config/screenConfig.ts`, the sidebar in `src/config/navigationConfig.ts`;
navigation goes through `navigate(name)` from `useApp()` — never mutate `screen` directly. Every
screen is lazy-loaded from `App.tsx`.

| Nav section | Screen | Route id |
|---|---|---|
| Overview | Dashboard | `dashboard` |
| Operations | Upload Agent BB (wizard entry) | `upload` |
| | · Review Extraction | `extraction-preview` |
| | · LP Match Queue | `match-queue` |
| | · LP Category & Shadow BB | `run-shadow-bb` |
| | Shadow BB | `shadow-bb` |
| | LP Master | `lp-master` |
| | · LP Master Records | `lp-master-records` |
| Insights | Reports | `reports` |
| Admin | Configuration | `configuration` |
| | Audit Trail | `audit` |
| | Field Mapping Dictionary | `field-mapping` |
| | Match Thresholds | `match-thresholds` |
| | BB Template Registry | `bb-templates` |

Indented screens are reached from their parent rather than the sidebar; `navigationConfig.ts` maps
each to the nav item that stays highlighted while it is open.

### Rank display boundary

`rank` is facility-specific. LP Master shows Rank in both the records table and the LP Record Entry
panel **only when a facility is selected** — the **All Facilities** path mixes records from different
facilities, so Rank is omitted there. Rank remains visible in Shadow BB.

## Upload wizard

The main workflow is a five-step wizard (`WIZARD_STEPS` comes from configuration; the submission's
`wizard_step` mirrors it, so a part-finished submission reopens where it was left):

1. **Select Facility / Upload** — pick a facility (or **+ Onboard New Facility…**, which warns that
   advance rates and concentration limits will use system defaults until credit-agreement rules are
   configured), set submission date and agent bank, drop the file, and optionally add notes. The
   **Template** selector defaults to auto-detect and can force a registered BB template when
   recognition picks the wrong one; a multi-tab template extracts every borrower sleeve on upload.
   Extraction runs inline, so a submission moves from `Processing` straight to step 3; a parse
   failure leaves it at step 1 with status `Error`.
2. **Review Extraction** — verify canonical field mapping; map or discard unrecognised columns
   (unmatched columns must be resolved before the step can be confirmed). The extracted LP table
   shows name, Agent LP classification (lifted from the agent column or from group-header section
   rows), commitment, uncalled capital, AUM, S&P / Moody's, advance rate, BB contribution, % of BB
   and concentration limit; click any row for full field detail including NAV, Fitch, Transferee and
   Parent / Sponsor. When the Agent BB file maps a **Borrowing Base** column but no **% of Borrowing
   Base** column, the Agent BB % is calculated as each LP's `Borrowing Base ÷ total Borrowing Base`;
   those cells are highlighted (sky-blue with a **Calc** badge) and a notice above the table reports
   how many values were calculated. The recognised format can be overridden and the file
   **Re-extracted** against a different template; individual rows can be discarded, and the whole
   submission aborted. **Confirm & Run LP Matching** advances to step 3.
3. **LP Match Queue** — review fuzzy name-match decisions for each extracted LP row. **Commit
   Decisions** persists the accepted LPs into LP Master (create new / update matched), deduped on
   `(facility, investor name)`. The grid's **Ultimate Parent (To Be Applied)** column shows whose
   credit profile an Accept would actually apply: a matched feeder or SPV routes up to its sponsor,
   so ratings, LP category and advance rate come from that entity, not from the row matched. It
   reads **Self** when the match is already the ultimate entity, and `—` when there is no match (a
   new LP record, so nothing is applied). The Match Analysis panel repeats this as a **Parent
   Routing** block, and the resolution is re-run when an analyst overrides the match by hand.
   Server-side the rule is *child-first, ancestors fill gaps* — the matched record's own values
   always win, and the sponsor supplies only what the feeder leaves blank (see the pe-sub-api
   README). Accepting a match also records the uploaded spelling as a **known alias**, so the next
   upload of that exact string matches at 100% without fuzzy scoring.
4. **LP Category & Rate Assignment** (`RunShadowBB`) — edits the **persisted** LP records created in
   step 3 (it reads `api.lpRecords.list({ facilityId })`, not the match queue). **Save** writes the
   category & rate edits back via `PATCH /api/lpRecords/classification`. UBS LP Classifications are
   auto-populated: derived from Agent LP Category / investor profile / agent rate when the record has
   none, then **upgraded from LP Master data** when that strictly improves the BUSA rate
   (investment-grade S&P/Moody's/Fitch rating → `Rated`; qualifying AUM → the unrated tiers;
   `Excluded` is never overridden). An upgraded class also resets the LP's UBS Advance Rate to its
   tier default, and an amber notice reports how many classifications were derived or upgraded.

   The **Borrowing Base Criteria Matrix** (`BB_CRITERIA_MATRIX`, resolved by `resolveBbCriteria` in
   `services/configService.ts`) is the **sole** source of the suggested UBS advance rate and per-LP
   concentration limit — funded-split and rating-band aware, mirroring the API's
   `BbCriteriaResolver`. There is no legacy flat-map fallback: a class the matrix does not carry
   keeps the LP's stored value. An erroneous row can be deleted here, which detaches its match-queue
   entries and recomputes the facility's ranks.
5. **Run Shadow BB** — computes and persists the BB snapshot from the saved LP records. The run
   response's `result.breaches` (evaluated server-side against the Concentration Limits in Config)
   render as attention alerts under Calculation Results: a red box for breaches ("must resolve before
   submitting BB certificate to agent"), an amber box for warnings, and the secondary action
   relabels to **Review Breaches in BB Results** while breaches exist. **Submit for Review** then
   hands the run to a Manager.

In the LP record detail form (`LPRecordPanel`), changing the **UBS LP Classification** auto-assigns
the **UBS Concentration Limit** to that class default (`CLS_CONC_LIMIT_DEFAULTS` from eligibility
config); entering a limit outside the class's accepted range (`CLS_CONC_LIMIT_BOUNDS`) shows a
non-blocking **⚠ Outside norm** warning under the field. These two maps seed and range-check the
entry form only — they no longer feed the BB engine or the wizard's suggested defaults, and the
Configuration screen no longer exposes them as an editable card.

### Submission ownership and concurrency

Upload stamps the submission with the uploader's uuName. `useCanEditSubmission`
(`components/ui/OwnershipBanner.tsx`) mirrors the server's `canModify`: the owner, a Manager, or a
legacy submission with no recorded owner may edit; anyone else is read-only. A non-owner Analyst
viewing someone else's in-flight submission gets the **OwnershipBanner** with an explicit **Take
over**, which transfers ownership, notifies the previous owner and locks them out — the controlled
alternative to two analysts clobbering the same work. Terminal submissions (`Processed`, `Aborted`)
cannot be taken over. Wizard writes carry the submission's version token, so a stale second tab is
rejected with `409` rather than overwriting newer work.

### Independent review (maker–checker)

A completed Shadow BB does not activate the facility by itself.

- **Submit for Review** (`POST /api/submissions/{id}/complete`, from step 5) — submission and
  facility both move to `Pending Review` and the maker's identity is recorded.
- **Approve** / **Reject…** (Manager only, on the Shadow BB screen) — approval sets the facility
  `Active`, writes the finalised credit profile back to LP Master and clears the live
  reclassification flags; rejection requires a written reason and returns the submission to step 5.
  Every other role sees a read-only "awaiting review" status in the same place.
- **Re-run Shadow BB** from the results screen calls
  `POST /api/submissions/facilities/{facilityId}/rerun-for-review`, which calculates and creates the
  review item atomically — seeded facilities have no upload-backed submission, so this is how a
  re-run still reaches a Manager.

## Shadow BB Results

The **Shadow BB Results** screen is **server-rendered**: the grid joins the latest snapshot's per-LP
engine results (`getFacilityBBSnapshot` returns `{ summary, breaches, lps }`) with the live LP
records (input fields, rank), and every BB figure — per-row Agent/UBS BB, excess concentrations,
%-of-BB shares, footer totals, the five-table summary (`GET /api/bb/summary-ext`) and the breach
verdict — comes from the server, frozen at the last run. The UI computes **nothing authoritative**:
`calcRow` and `computeLPRecord` survive only as instant previews of *unsaved* edits (an edited row
shows live preview values; an "Unsaved changes" banner explains that totals, summary and breaches
stay frozen until **Re-run Shadow BB**). The Run Shadow BB wizard step likewise posts input fields
only — `abb`/`ubb`/excess concentrations are not part of the commit payload — and renders the run
response's summary.

Breach and warning panels appear above the LP grid when the latest snapshot carries them, listing
Rule, Detail, Current and Limit from the persisted verdict. They hide while local overrides are
active, since the stored verdict no longer matches the recomputed preview below. A stale-run banner
appears when LPs have been reclassified since the last run.

**↓ Export** writes a single-sheet workbook (`exceljs`) laid out like the screen: the four summary
tables (LP Portfolio, Borrowing Base, BUSA, Agent) side by side across the top in their on-screen
colours — each outlined in navy and separated by an empty gutter column — then the LP grid carrying
**every** column of the visible table, in screen order, for the rows currently sorted and filtered.
Money is written in full dollars and percentages as fractions, both with Excel number formats, so the
sheet stays sortable and summable.

## LP Master Records

`LP Master` (`lp-master`) is the facility-scoped view: pick a facility, or **View All N LPs →** for
every facility's LP *records*. Alongside that button, **View Master N LP Records →** opens
`LPMasterRecords` (`lp-master-records`) — the bank-wide curated store those records are seeded
from. The two are deliberately siblings, not modes of one screen: LP Records are per-facility
outcomes carrying commitments and borrowing base, while LP Master rows are the upstream profiles
that *feed* them, so the columns stop at the credit profile and add the parent/child hierarchy
instead.

The facility picker itself is a table, not a tile grid, carrying the same Agent Bank Summary columns
as the Dashboard (Facility, Agent Bank, # LPs, Account #, Loan Amount, UBS Participation, Maturity
Date, Collateral Date, Facility Status) plus **Last BB Run** last — an explicit run date, with the
relative form ("2d ago") on hover, and a `◆ BB` marker for a facility carrying BB figures but no run
timestamp. Sorting runs on the underlying values, not the display strings, so dates order
chronologically and `# LPs` numerically. Column widths default wide enough for each header to sit on
one line beside its sort indicator, and the summed width is the table's minimum, so a narrow viewport
scrolls horizontally rather than squeezing columns.

The **Facility** cell is drawn as a folder tab (`.folder-tab` inside a `.folder-tab-wrap` cell —
a nested span because `border-collapse: collapse` makes a `td` ignore `border-radius`). Tabs rest in
neutral grey and light gold/amber with a red spine when hovered; clicking one opens that facility's
LP records, while clicking anywhere else on the row opens the Facility Edit overlay (editors only —
there is no pencil column). The same tab marks the Facility column of the **View All LPs** table,
and the facility you drilled into keeps wearing it in the LP records header, pinned to the
highlighted state (`.folder-tab-open`) because that is the folder you are inside.

Both stores export to Excel from their filter bars, each behind a **↓ Export** button
(`lp-records-<date>.xlsx` and `lp-master-records-<date>.xlsx`), built in
`services/lpExportService.ts`. Each writes the **whole** table — screen filters and pagination are
ignored, and the LP records export refetches `GET /api/lpRecords` so it is a copy of the store
rather than of the current view. Money and the concentration limits go out as the API's display
strings; rates and ratios, which arrive as fractions, become numbers under `(%)` headers so a
spreadsheet can sum them, and absent values are empty cells rather than `—`.

The screen reuses the LP Records layout exactly — same `Card` + filter bar, dense sortable/resizable
table, pagination, and a right-docked editable panel (`LPMasterPanel` inside a `DraggablePanel`
using the same `.LPRecord-detail-overlay` class, so the same width and position). Columns cover the
subset that applies ratings and classifications to a matched row: Investor Name, Parent, Children,
SPV, Region, Investor Type, Institutional vs HNW, UBS LP Classification, Investment Grade,
S&P / Moody's / Fitch, LP Size + Size Measure, Funded Ratio, UBS Default Advance Rate, UBS Default
Concentration Limit, Notes. A **Hierarchy** filter narrows to ultimate entities, feeders & SPVs, or
sponsors with children.

There is deliberately **one** Parent column, not a Parent plus an Ultimate Parent: every chain in
the data is a single hop, so the two were identical on all linked rows. The `ultimateParent`
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
Loan Amount, Maturity Date, Collateral Date, Facility Status, Facility Status Date). Account Number /
Loan Amount / Maturity Date / Collateral Date are facility inputs sourced from the facility record
and edited on the **Facility Edit** overlay in LP Master (persisted via `PATCH /api/facilities/{id}`).
The overlay makes **all** facility fields editable, including the Identity fields **Borrower (name)**
and **Agent Bank** (# LPs and Facility Status Date stay read-only — they are derived). It also lets a
facility with **no LP records** be **Deactivated** (`PATCH /api/facilities/{id}/status` → `Inactive`,
reversible via **Reactivate**), disabled while LP records exist. A facility is **never deleted from
the UI** — deactivation is the only retirement path, so LP records and Shadow BB history stay
auditable, and the API client deliberately exposes no `DELETE /api/facilities/{id}` wrapper.
Facility Status / Status Date reflect the internal workflow status.

The call to action on the selected facility is status- and role-aware: **Start Submission** (Not
Started), **View Submission** (In Progress / Needs Review — routing straight to the wizard step the
submission stopped at), **Review Shadow BB** for a Manager or "Awaiting approval" for everyone else
(Pending Review), and **View Shadow BB** (Active). The submitting analyst is named alongside, with a
"(view only)" marker for users who may not act on it.

Selecting a row also populates the **LP Classification** donut (live LP class breakdown) and the
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
  "Include LPs" control the LP drill-down table. A format selector (PDF / Excel / Both) picks the
  export: **Download XLSX** builds the certificate client-side (Summary / LP Categories / LPs
  sheets) via the `xlsx` package, and **Download PDF** streams the styled certificate from
  `GET /api/reports/collateral/{facilityId}/pdf`.
- **Effective Advance Rates** — `GET /api/reports/ear/{facilityId}`: one row per Shadow BB run.
- **Agent Bank Exposure** — `GET /api/reports/agent-banks`, optionally filtered to one bank.
- **Concentration Exposures** — `GET /api/reports/concentration/{facilityId}` per selected facility
  (or every facility, skipping those without a snapshot); the test checkboxes filter breach types.
- **Ad Hoc Reporting** — `GET /api/lpRecords` with category filter and client-side sort; **Run & Export**
  downloads the result as XLSX immediately.
- **Scheduled Reports** — read-only list from `GET /api/config/reports`.

Each successful generation is recorded via `POST /api/reports/history` and the **Report History**
card (shown with the certificate preview) lists `GET /api/reports/history`.

## Admin screens

- **Configuration** — four cards persisted in the API's `config` table: the **Borrowing Base
  Criteria Matrix** (advance rate by funded split, concentration limit by class / rating band — the
  source of the wizard's step-4 defaults), **Concentration Limits** (portfolio-level thresholds that
  drive breach detection on every run), the **Agent Advance Rate Schedule**, and **Global Settings**
  (platform-wide defaults including snapshot frequency).
- **Field Mapping Dictionary** — alias groups mapping extracted column headers to canonical LP Master
  fields, organised by group, across three alias tiers (Core read-only, Bank, User), plus the
  qualifier blocklist and pending suggestions. This is what the extraction engine's alias config is
  built from.
- **Match Thresholds** — confidence thresholds (auto-accept / review / no-match), Jaro-Winkler vs
  Levenshtein weighting, legal-entity suffix stripping rules, the abbreviation expansion dictionary,
  and a **Match Test Tool** that previews how a name would score against LP Master.
- **BB Template Registry** — one row per Agent BB workbook format: tabs to read, header row position
  and span, and the LP-category group sections. Templates can be authored by hand or imported from a
  structured XLSX, and the original workbook stays downloadable.
- **Audit Trail** — timestamp, event, detail, facility, authenticated principal and source IP,
  filterable by event / user / free text and refreshed on a 10-second poll.

All five are read-open to any operator, and every mutation is `ANALYST`-gated server-side. Only the
Configuration screen also gates client-side — it renders read-only without the `editConfig`
capability; the others rely on the API to reject the write.

## Notifications

`useServerEvents` subscribes to `GET /api/notifications/events` (SSE, auto-reconnecting after 5s) and
raises a toast for each server message. Alongside it, `AppContext` builds a durable notification
queue from workflow state (`utils/reviewNotifications.ts`) rendered in the TopBar panel: Managers see
submissions awaiting approval, makers see approvals and change requests, and everyone sees
reclassification notices for facilities whose Shadow BB has gone stale. There is deliberately no
separate "unread" flag — a message stays pending until the underlying submission is acted on.

## Configuration cache

`store/configStore.ts` is the one Redux slice: a single `loadConfig` thunk fetches classification,
eligibility and wizard config once, and `useConfigCache()` serves every consumer from it.
`loadConfig` must route through `getClassificationConfig()` rather than `api.config.classification()`
— that wrapper merges live LP Master investor types into `INVESTOR_TYPE_OPTS`, and bypassing it makes
the cached config quietly narrower than what screens calling the service directly receive. The thunk
also normalises the BUSA rate map from `BUSA_TIERS`, so classification options and rates cannot drift
apart from the eligibility config.

## Project structure

```
src/
  auth/           Dev sign-in session, X-Auth header install, role/capability map
  components/
    auth/         DevSignIn gate
    layout/       Sidebar, TopBar (status badge, account panel, notifications)
    ui/           Primitives (Button, Card, Modal, Tag, StepBar, DataTable, DropZone,
                  DraggablePanel, LPRecordPanel, LPMasterPanel, OwnershipBanner, …)
  config/         Screen metadata, navigation + dev USERS, region reference data
  context/        AppContext (screen, toasts, LP data, submission, notifications), AuthContext
  hooks/          usePagination, useTableSort, useColumnResize, useServerEvents
  screens/        One folder per screen
    AuditTrail/  BBTemplates/  Configuration/  Dashboard/  ExtractionPreview/
    FieldMapping/  LPMaster/  LPMasterRecords/  MatchQueue/  MatchThresholds/
    Reports/  RunShadowBB/  ShadowBB/  Upload/
  services/       API client (api.ts) and domain services (facility, extraction, matching,
                  config, report, template, lp, classification, bbCalculation)
  store/          configStore.ts — Redux Toolkit configuration cache
  types/          Domain types: LP, Facility, BBResult, etc.
  utils/          Fuzzy matching, formatting, ratings, LP category order/palette,
                  dashboard status, exec summary, review notifications
  __tests__/      Vitest suites + shared support fixtures
```

## Testing

```bash
npm test
```

Vitest runs in the `node` environment over `src/__tests__/**/*.test.ts`. Coverage rules:

- Every screen that reads data must have a test asserting real field values render against a mocked
  API response — never a hardcoded string.
- Every service function must be tested with a mocked `fetch` response mirroring the API contract.
- Never use `expect(screen.getByText('—'))` as a passing assertion; null/missing data must be tested
  with a known fixture.
- `devSignIn.test.ts` pins the `USERS` role labels against `RoleMeta.label` — if they drift, a user
  silently becomes read-only, so keep it passing when touching either file.

## Environment

| Variable | Used by | Notes |
|---|---|---|
| `VITE_API_PROXY_TARGET` | dev server | **Required** for `npm run dev` — Vite throws at startup without it |
| `VITE_DEV_PORT` | dev server | Dev server port (`3000` in `.env.development`) |
| `VITE_API_BASE_URL` | build | Empty for local dev, where the same-origin `/api` proxy is used |
| `VITE_DEV_SIGN_IN` | build | Compiles the dev sign-in gate into a non-dev build |
| `PE_SUB_API_UPSTREAM` | container | nginx `/api` proxy target, substituted at container start |

`.env.development` covers local development as-is. `.env.dev`, `.env.qa` and `.env.production` are
templates whose `${…}` placeholders are substituted by the deployment pipeline; `.env.example`
records the minimum a custom setup needs.
