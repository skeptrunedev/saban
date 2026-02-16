# Saban Server

Elysia/Bun-based API server for the Saban LinkedIn leads management system.

## Local Development

```bash
# From repo root
pnpm install
pnpm --filter @saban/server dev

# Or from this directory
bun run src/index.ts
```

The server runs on port 3847 by default.

## Production Deployment

The server runs on the host machine at `skeptrune.com` (5.78.129.161).

### Starting the Server

```bash
cd /home/skeptrune/git_projects/skeptrunedev/saban/packages/server

# Build first (optional, can run from source)
pnpm build

# Run the server
nohup bun run src/index.ts > /tmp/saban-server.log 2>&1 &
```

### Restarting the Server

```bash
# Find the running process
ps aux | grep "bun run src/index" | grep -v grep

# Kill it (replace PID)
kill <PID>

# Start fresh
cd /home/skeptrune/git_projects/skeptrunedev/saban/packages/server
nohup bun run src/index.ts > /tmp/saban-server.log 2>&1 &

# Check logs
tail -f /tmp/saban-server.log
```

### One-liner Restart

```bash
cd /home/skeptrune/git_projects/skeptrunedev/saban/packages/server && \
  pnpm build && \
  pkill -f "bun run src/index" && \
  sleep 1 && \
  nohup bun run src/index.ts > /tmp/saban-server.log 2>&1 &
```

## URLs

- **API (Production)**: https://saban-api.skeptrune.com
- **API (Local)**: http://localhost:3847
- **Web (Production)**: https://saban.skeptrune.com
- **Web (Local)**: http://localhost:5173

## Environment Variables

The server loads environment variables from `../../.env` (repo root). Key variables:

- `PORT` - Server port (default: 3847)
- `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` - PostgreSQL connection
- `WORKOS_API_KEY`, `WORKOS_CLIENT_ID` - WorkOS authentication
- `JWT_SECRET` - JWT signing secret
- `BRIGHTDATA_API_KEY` - BrightData API for profile enrichment
- `ANTHROPIC_API_KEY` - Anthropic API for AI qualification scoring

## Database

PostgreSQL runs in Docker:

```bash
# Start PostgreSQL
cd /home/skeptrune/git_projects/skeptrunedev/saban
docker-compose up -d postgres

# Connect
PGPASSWORD=linkedin psql -h localhost -U linkedin -d linkedin_profiles
```

Schema is in `./schema/schema.sql`.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Chrome Ext     │────▶│  Elysia Server  │────▶│   PostgreSQL    │
│  (captures)     │     │  (port 3847)    │     │   (Docker)      │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │   BrightData    │
                        │  (enrichment)   │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ Cloudflare R2   │
                        │ (results store) │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ CF Worker       │
                        │ (cron polling)  │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ Scoring Worker  │
                        │ (AI evaluation) │
                        └─────────────────┘
```

## API Routes

- `POST /api/profiles` - Create profiles (from extension)
- `GET /api/profiles` - List profiles with filtering/sorting
- `GET /api/profiles/:id` - Get single profile
- `PATCH /api/profiles/:id` - Update profile (notes, tags, status)
- `GET /api/qualifications` - List job qualifications
- `POST /api/qualifications` - Create qualification criteria
- `POST /api/enrichment/enrich` - Trigger BrightData enrichment
- `GET /api/image-proxy?url=<base64>` - Proxy LinkedIn images (CORS workaround)

## Logs

```bash
# Server logs
tail -f /tmp/saban-server.log

# Web dev server logs
tail -f /tmp/saban-web.log
```
