# Sorcery Client

A web-based game client for playing [Sorcery: Contested Realm](https://www.sorcerytcg.com/) online. Features a 3D game board, real-time multiplayer, draft/sealed modes, deck building, tournaments, and CPU bot opponents.

Play now at [realms.cards](https://realms.cards).

[Invite the Discord bot to your community](https://discord.com/oauth2/authorize?client_id=1412710227446337567&permissions=275414871104&scope=bot+applications.commands)

## Features

- **3D Game Board** - Interactive board rendered with React Three Fiber / Three.js
- **Online Multiplayer** - Real-time matches via Socket.IO with chat and board pings
- **Draft & Sealed** - Open boosters, draft with up to 8 players, build limited decks
- **Cube Draft** - Create and draft custom cubes
- **Deck Editor** - Build constructed decks with card search, import/export (Curiosa-compatible)
- **Tournaments** - Swiss-pairing tournament system with standings and statistics
- **CPU Bots** - Play against AI opponents with configurable difficulty
- **Collection Tracker** - Track your physical card collection
- **Tutorial** - Interactive lessons teaching Sorcery game mechanics
- **Mobile Support** - Touch-optimized interface with responsive layout

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript 5, Tailwind CSS
- **3D Engine**: React Three Fiber, Three.js, drei
- **Backend**: Node.js Socket.IO server (standalone)
- **Database**: PostgreSQL via Prisma ORM
- **Cache/Pubsub**: Redis (optional, required for horizontal scaling)
- **Auth**: NextAuth.js (Discord OAuth, email magic links, passkeys)
- **Testing**: Vitest, React Testing Library

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL (local via Docker or managed)
- Redis (optional, for multi-instance setups)

### 1. Clone and install

```bash
git clone https://github.com/your-org/sorcery-client.git
cd sorcery-client
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and set at minimum:

```bash
DATABASE_URL="postgresql://sorcery:sorcery@localhost:5432/sorcery?schema=public"
DIRECT_URL="postgresql://sorcery:sorcery@localhost:5432/sorcery?schema=public"
NEXTAUTH_SECRET="<generate with: openssl rand -base64 32>"
NEXT_PUBLIC_WS_URL="http://localhost:3010"
```

See [.env.example](.env.example) for all available variables with documentation.

### 3. Start the database

```bash
npm run db:up              # Start Postgres via Docker
npm run prisma:generate    # Generate Prisma client
npm run prisma:migrate:dev # Run migrations
npm run db:seed            # Ingest cards and seed pack configs
```

### 4. Start development

```bash
# Terminal 1: Next.js dev server
npm run dev

# Terminal 2: Socket.IO game server
npm run server:dev
```

Open [http://localhost:3000](http://localhost:3000).

### Docker (full stack)

Run everything with Docker Compose:

```bash
npm run stack:up           # Postgres + Redis + Socket.IO servers + Caddy LB
npm run dev                # Next.js dev server (connects to stack)
```

## Development

### Commands

| Command                           | Description                  |
| --------------------------------- | ---------------------------- |
| `npm run dev`                     | Start Next.js dev server     |
| `npm run server:dev`              | Start Socket.IO server (dev) |
| `npm run build`                   | Production build             |
| `npm run test`                    | Run tests                    |
| `npm run test:watch`              | Run tests in watch mode      |
| `npm run lint`                    | Run ESLint                   |
| `npm run db:up` / `db:down`       | Start/stop local Postgres    |
| `npm run redis:up` / `redis:down` | Start/stop local Redis       |
| `npm run stack:up` / `stack:down` | Start/stop full Docker stack |
| `npm run db:seed`                 | Seed cards and pack configs  |
| `npm run prisma:migrate:dev`      | Create/apply DB migrations   |
| `npm run prisma:generate`         | Regenerate Prisma client     |

### Project Structure

```
src/
  app/              # Next.js App Router pages and API routes
  components/       # React components (game/, ui/, tutorial/, etc.)
  lib/              # Core logic (game store, tournament, tutorial engine)
  hooks/            # Custom React hooks
server/             # Standalone Socket.IO game server
  modules/          # Server modules (tournament, draft, standings)
  rules/            # Game rule enforcement
prisma/             # Database schema and migrations
bots/               # CPU bot engine and card evaluations
data/               # Card data, deck precons, bot params
public/             # Static assets, manual, changelog
```

### Rules Engine

The game server includes a rules engine with configurable enforcement:

- `RULES_ENFORCE_MODE=off` - Helpers only (default, free-form play)
- `RULES_ENFORCE_MODE=bot_only` - Strict for CPU bots, helpers for humans
- `RULES_ENFORCE_MODE=all` - Strict enforcement for everyone

Helpers (when enabled) handle turn-start untap, mana accounting, and cost auto-application.

### CPU Bots

```bash
# Spawn bots into a private lobby
CPU_BOTS_ENABLED=1 npm run server
npm run bots:spawn -- --bots 2 --match constructed
```

See [bots/engine/README.md](bots/engine/README.md) for bot architecture and configuration.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for production deployment with Docker.

See [SELF_HOSTED_FRONTEND.md](SELF_HOSTED_FRONTEND.md) for self-hosting the full stack (replacing Vercel).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute.

## Attribution

- Mahogany Table model by [mindman](https://sketchfab.com/3d-models/mahogany-table-e9ef3eadee9d4491b7c59fdbb19c30cd)
- Lava Table model by [A.Camplin Studios](https://sketchfab.com/3d-models/marble-coffee-table-20421b2e850c4787a4d0989defe84d69)

## License

This project is open source. See [LICENSE](LICENSE) for details.
