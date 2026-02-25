# AGENTS.md

## Cursor Cloud specific instructions

### Overview

CUPA Position & Equity Analysis Tool — an npm workspaces monorepo with three packages:

| Package | Path | Purpose |
|---------|------|---------|
| `@cupa/shared` | `packages/shared` | Shared TypeScript types and constants |
| `@cupa/server` | `packages/server` | Express.js REST API (port 3001) |
| `@cupa/client` | `packages/client` | React SPA via Vite (port 5173) |

No external databases or services needed. SQLite is embedded via `sql.js` and auto-created at `./data/cupa.db` on first server start. Default users (`admin@moravian.edu` / `admin123`, `hr@moravian.edu` / `hr123`) are seeded automatically when the DB is empty.

### Running the app

```bash
npm run build:shared   # must build shared types before dev servers
npm run dev            # starts both server (:3001) and client (:5173) via concurrently
```

The Vite dev server proxies `/api` requests to the Express server on port 3001.

### Lint / Typecheck / Test

- **Typecheck**: `npm run typecheck` — runs `tsc --noEmit` for both client and server.
- **Lint**: `npm run lint` — currently fails because no ESLint config file exists in the repo (pre-existing issue). Use `npm run typecheck` as the primary static analysis check.
- **Tests**: `npm run test -w @cupa/server` — runs Vitest tests in the server package (43 tests).

### Gotchas

- You **must** run `npm run build:shared` before starting dev servers or running typecheck/tests, since both client and server depend on `@cupa/shared` compiled output.
- The server uses `tsx watch` for hot-reloading, but changes to `@cupa/shared` types require rebuilding shared (`npm run build:shared`) and restarting the server.
- Optional features (AI matching, email, Okta SSO) degrade gracefully when their env vars are unset — no secrets are required for core development.
