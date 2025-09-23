This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

## Development: Rules Engine and Simulation

### Environment variables

Set these in `.env.local` (or export for your shell). See `example.env` for defaults and comments.

- `PORT`: Socket.IO server port (default `3010`).
- `CPU_BOTS_ENABLED`: Enable server-managed headless CPU players (`1`/`true` to enable).
- `RULES_ENFORCE_MODE`:
  - `off` – Helpers only (no strict gating for anyone)
  - `bot_only` – Strictly enforce for CPU bots; humans get helpers and warning events
  - `all` – Strictly enforce for everyone
- `RULES_HELPERS_ENABLED`:
  - `true` – Apply helpers like turn-start untap, per-turn spend accounting, cost auto-apply
  - `false` – Disable helper auto-adjustments

### Rules helpers vs enforcement

- Helpers (always-on when `RULES_HELPERS_ENABLED=true`):
  - Turn start untap for acting player
  - Per-turn spend accounting (`resources[p1|p2].spentThisTurn`)
  - Cost auto-application (increments `spentThisTurn`)
- Enforcement (gating):
  - Site overwrite/adjacency/ownership
  - Permanents timing (Main phase, acting player)
  - Threshold checks
  - When enforcement is off for an actor, violations emit `events: [{ type: 'warning', ... }]` instead of blocking.

### Dev scripts

- Spawn CPU bots into a private lobby and start a match:

  ```bash
  CPU_BOTS_ENABLED=1 npm run server
  npm run bots:spawn -- --bots 2 --match constructed
  # Flags: --server http://localhost:3010 --name "Bot Scrimmage" --match constructed|sealed|draft
  ```

- Simulate multiple hosts vs CPU opponents and print a summary report:

  ```bash
  npm run sim:tournament -- --hosts 3 --rounds 2
  ```

- Run targeted rules tests only (faster):

  ```bash
  npm run test:rules
  ```

## Database: PostgreSQL (Dev & Prod)

We now use PostgreSQL via Prisma for both development and production.

- Local dev uses Docker (Postgres 16). See `docker-compose.yml`.
- Production is designed for a managed Postgres (DigitalOcean or Supabase). Use a pooled connection for `DATABASE_URL` and a direct primary for `DIRECT_URL`.

### 1) Start local Postgres

```bash
npm run db:up
```

This exposes Postgres on `localhost:5432` with database/user/password `sorcery`.

### 2) Configure `.env.local`

Copy `example.env` to `.env.local` and set:

```bash
DATABASE_URL="postgresql://sorcery:sorcery@localhost:5432/sorcery?schema=public"
DIRECT_URL="postgresql://sorcery:sorcery@localhost:5432/sorcery?schema=public"
```

### 3) Generate client and run migrations

```bash
npm run prisma:generate
npm run prisma:migrate:dev
```

This will create/update the schema in your local Postgres. If switching from SQLite, Prisma will create a new migration history for Postgres.

### 4) Seed core data

```bash
npm run db:seed
```

This ingests Sorcery cards/sets/variants from the public API and seeds pack configs for booster generation.

### 5) Production

Set `DATABASE_URL` to a pooled endpoint and `DIRECT_URL` to the primary endpoint of your managed Postgres.

- DigitalOcean Managed Postgres: use the Connection Pooler for `DATABASE_URL` and the primary for `DIRECT_URL` (both with `sslmode=require`).
- Supabase: use port `6543` (pooled) for `DATABASE_URL` and `5432` (direct) for `DIRECT_URL`.

Deploy migrations in CI/CD with:

```bash
npm run prisma:migrate:deploy
npm run db:seed   # optional, if you want to refresh/ingest data
```

Note: The standalone Socket.IO server (`server/index.js`) loads `.env` via `dotenv`, so it can connect to Postgres when run directly with `node`.

## Realtime Server & Scaling (Socket.IO)

### Client WebSocket configuration

Configure the web app to talk to the Socket.IO server explicitly in development.

Add these to `.env.local` (see `example.env` for comments):

```bash
# Point the Next.js client at the Socket.IO server
NEXT_PUBLIC_WS_URL="http://localhost:3010"
# Optional: custom Socket.IO path if you change from the default '/socket.io'
# NEXT_PUBLIC_WS_PATH=
# Recommended behind proxies/load balancers: force websocket transport
NEXT_PUBLIC_WS_TRANSPORTS=websocket

# HTTP origin for REST-like endpoints served by the Socket.IO server (e.g., /players/available)
# If omitted, the client may derive it from NEXT_PUBLIC_WS_URL (ws/wss → http/https).
# Set explicitly if your WS domain differs from the HTTP origin.
NEXT_PUBLIC_WS_HTTP_ORIGIN="http://localhost:3010"
```

On the server side (when running `npm run server` locally), allow your web origin:

```bash
SOCKET_CORS_ORIGIN="http://localhost:3000"
```

If you access the app via a LAN IP (e.g., `http://192.168.x.x:3000`), include it:

```bash
SOCKET_CORS_ORIGIN="http://localhost:3000,http://192.168.x.x:3000"
```

Restart the server and the Next.js dev server after changing env variables.

### Troubleshooting common WebSocket errors

- __Client cannot connect / 400 on polling__: set `NEXT_PUBLIC_WS_TRANSPORTS=websocket`.
- __CORS error on handshake__: set `SOCKET_CORS_ORIGIN` on the server to include your web origin(s).
- __Wrong host/port__: ensure `NEXT_PUBLIC_WS_URL` points to `http://localhost:3010` (or your Caddy endpoint).
- __Health check__: `curl -s http://localhost:3010/healthz` should return JSON with `db`, `redis`, and `matches`.

### Dockerized scaling (2 instances + Caddy load balancer)

We provide a ready-to-run stack in `docker-compose.yml`:

- `postgres` – database
- `redis` – Socket.IO adapter (sessions/rooms across instances)
- `migrate` – applies Prisma migrations
- `server1`, `server2` – two Socket.IO instances (built from `Dockerfile.server`)
- `caddy` – reverse proxy / load balancer on `http://localhost:3010`

Commands:

```bash
# Build server images and caddy
npm run server:docker:build

# Start two servers behind Caddy
npm run server:docker:up

# Tail server and caddy logs
npm run server:docker:logs

# Bring up the full stack (Postgres, Redis, migrate, servers, Caddy)
npm run stack:up

# Tear down the stack
npm run stack:down

# Manage individual services
npm run db:up
npm run redis:up
```

By default, the client should connect to Caddy at `http://localhost:3010`.
