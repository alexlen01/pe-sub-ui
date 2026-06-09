# pe-sub-ui — Project Rules

React 18 / TypeScript 5 / Vite 6. Dev server: http://localhost:3000.

State is managed via **React Context** (`src/context/AppContext.tsx`). There is no Redux store in this project.

---

## Live / Prototype Indicator

### What it is

A persistent badge in `TopBar.tsx` that shows the current data mode:

| Mode | Label | Colors |
|---|---|---|
| `live` | `● Live` | Green bg `#e6f4ea`, text `#1e7e34` |
| `prototype` | `● Prototype` | Amber bg `#fff3cd`, text `#856404` |
| `detecting` | `○ Checking` | Muted — not clickable |

These exact colors and labels are canonical. Do not change them unless the user explicitly asks.

### Consistency rule

Every screen in the app must respect `screenMode` from `useApp()` to decide whether to fetch from the API or use hardcoded data. No screen may hardcode a data source or ignore `screenMode`.

### Mode persistence rule

**`screenMode` must never change during navigation.** Once detection completes on initial load (or the user manually toggles), the selected mode sticks across every screen until the user explicitly toggles again.

`navigate()` in `AppContext` must NOT set `screenMode` to `'detecting'`. Detection runs exactly once — on app startup, because the initial state is `'detecting'`. After that, only the TopBar toggle may change `screenMode`.

### Reset-on-toggle rule

**When the user switches between Live and Prototype, the entire application must reset to its default state — equivalent to a fresh browser load.**

The toggle handler lives in `TopBar.tsx:handleToggle`. Whenever it switches `screenMode`, it must also reset all transient app state to its initial values via `resetAppState()`:

- `screen` → `'dashboard'`
- `lpData` → `[]`
- `bbParams` → `DEFAULT_FACILITY_PARAMS`
- `activeSubmission` → `null`
- `activeSubmissionId` → `null`
- `activeFacilityId` → `null`
- `abortedFacilities` → `[]`
- `targetFacility` → `null`

**Do not implement partial resets.** If any of the above fields are missing, data from the previous mode will bleed into the new one.

`resetAppState` must NOT reset `screenMode` — the toggle handler sets the new mode separately, after the reset.

### What NOT to do

- Do not call `setScreenMode` directly from the toggle without also resetting state.
- Do not navigate to a different screen and rely on that to clear state — reset first, then navigate.
- Do not add a "are you sure?" confirmation dialog before the toggle — the reset should be instant and silent.

---

## Screens and Routing

Screen names are defined in `src/config/screenConfig.ts`. Navigation goes through `navigate(name)` from `useApp()` — never mutate `screen` directly.

---

## Data Hooks

- **Live mode**: components call the real API via service functions in `src/services/`.
- **Prototype mode**: components fall back to static data in `src/data/`.
- Always branch on `screenMode === 'live'` — do not invent a new flag or prop.

---

## Test Coverage

- Every screen that reads data must have a test asserting real field values render (no hardcoded prototype strings).
- Mode-switching must be tested: after toggling, the app must land on `dashboard` with all state at defaults.
- Never use `expect(screen.getByText('—'))` as a passing assertion — null/missing data must be tested with a known fixture.
