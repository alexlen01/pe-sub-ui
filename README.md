# pe-sub-ui

React / TypeScript / Vite frontend for the PE Sub Borrowing Base Platform.

## Stack

- React 18, TypeScript 5, Vite 5
- Domain types in `src/types/` (LP, Facility, BBResult, etc.)
- API calls proxied through Vite dev server to `pe-sub-api` on port 3001

## Prerequisites

- Node.js 20+
- `pe-sub-api` running on port 3001

## Getting started

```bash
npm install
npm run dev
```

App runs at `http://localhost:3000`.

## Other commands

```bash
npm run build       # production build
npm run typecheck   # tsc --noEmit
```

## Project structure

```
src/
  components/     UI primitives and layout
  config/         Static configuration (advance rates, nav, wizard steps)
  data/           Seed/reference data (LP names, extraction samples)
  hooks/          Shared React hooks
  screens/        One folder per screen
  services/       API client and domain service functions
  types/          Domain types: LP, Facility, BBResult, etc.
  utils/          Fuzzy matching and other utilities
```

## Environment

No `.env` required for local development — the Vite proxy handles `/api` → `localhost:3001` automatically. See `.env.example` if you need to point at a remote API.
