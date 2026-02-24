# AGENTS.md

## Cursor Cloud specific instructions

### Project Overview

A pnpm monorepo for managing captured contacts and scoring them. Key packages:

- `packages/server` — Elysia/Bun API server (port 3847)
- `packages/web` — React + Vite frontend (port 5173)
- `packages/shared` — Shared TypeScript types
- `packages/worker` — Cloudflare Worker (optional)
- `packages/scoring-worker` — Cloudflare Worker (optional)

### Prerequisites

- **Bun** runtime (required for `@saban/server`): install via `curl -fsSL https://bun.sh/install | bash`
- **Docker** (required for PostgreSQL): must be installed and running with `fuse-overlayfs` storage driver and `iptables-legacy` in the Cloud Agent container environment
- **pnpm** and **Node.js >= 18** (pre-installed in Cloud Agent)

### Starting Services

1. **PostgreSQL**: `sudo docker compose up -d postgres` (from repo root). The schema is auto-loaded via `docker-entrypoint-initdb.d`. Apply migrations in order: `packages/server/schema/001_*.sql` through `004_*.sql`.
2. **Build shared types first**: `pnpm --filter @saban/shared build` (both server and web depend on this)
3. **API server**: `cd packages/server && bun --watch src/index.ts` (port 3847). Must run from `packages/server/` directory so dotenv resolves `../../.env` correctly.
4. **Web dev server**: `pnpm --filter @saban/web dev` (port 5173, proxies `/api` to server)

### Environment Variables

The server loads `.env` from the repo root via dotenv. Cloud Agent secrets are injected as environment variables and take precedence over `.env` values (dotenv does not override existing env vars). Key vars: `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGHOST`, `PGPORT`, `ADMIN_API_KEY`, `JWT_SECRET`, `INTERNAL_API_KEY`, `FRONTEND_URL`.

### Authentication Bypass

For local/testing, use the `X-Admin-Api-Key` header with the value of `$ADMIN_API_KEY` env var. For web UI testing, set a `saban_session` cookie with base64-encoded JSON: `{"user":{"id":"admin-test-user","email":"admin@test.local","firstName":"Admin","lastName":"Test","profilePictureUrl":null},"organizationId":"<org-id>"}`. This requires a matching user and org in the DB.

### Gotchas

- The server **must** be started from `packages/server/` (not repo root) so the dotenv path `../../.env` resolves correctly.
- `pnpm --filter @saban/shared build` must complete before starting the server or web app.
- The `@saban/worker` and `@saban/scoring-worker` packages have pre-existing type errors and are optional for core development.
- The web package has a pre-existing lint error (unused import in `Qualified.tsx`).
- The DB schema file mounted in docker-compose only creates the base `similar_profiles` table. Migrations `001` through `004` in `packages/server/schema/` must be applied manually for full functionality (users, organizations, qualifications, enrichments).

### Standard Commands

See `package.json` scripts at repo root: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm dev`, `pnpm format`.
