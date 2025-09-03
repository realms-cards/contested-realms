# Repository Guidelines

## Project Structure & Module Organization
- Source: `src/` (Next.js App Router in `src/app`, UI in `src/components`, utilities in `src/lib`, types in `src/types`).
- Server: `server/` (Node + Socket.IO game/lobby server; run separately from Next.js).
- Data & Assets: `data*/` for card assets and KTX2 outputs, `public/` for static files, `reference/` for rulebook and codex. Snapshot of all cards: `data/cards_raw.json`.
- Database: `prisma/` (SQLite dev DB `prisma/dev.db`, schema in `schema.prisma`).
- Scripts: `scripts/` for ingestion, seeding, and asset compression.
- Path aliases: import app code via `@/*` (see `tsconfig.json`).

## Build, Test, and Development Commands
- `npm run dev`: Start Next.js dev server at `http://localhost:3000`.
- `npm run server`: Start Socket.IO server (defaults to port `3001`).
- `npm run build` / `npm run start`: Build and serve production build.
- `npm run prisma:generate`: Regenerate Prisma Client after schema changes.
- `npm run prisma:migrate`: Create a dev migration (SQLite) named `init`.
- `npm run prisma:push`: Push schema to the local dev DB without a migration.
- Data/Assets: `npm run ingest:cards`, `npm run seed:packs`, `npm run assets:compress[:out|:etc1s]`.

Example (two terminals):
- Terminal A: `npm run dev`
- Terminal B: `npm run server`

## Coding Style & Naming Conventions
- Language: TypeScript (strict). React 19, Next.js 15 App Router.
- Linting: ESLint extends `next/core-web-vitals` and `next/typescript` (see `eslint.config.mjs`). `scripts/`, `server/`, and local `debug-*.js` / `test-*.js` are ignored by lint.
- Components: PascalCase in `src/components`. Routes: lowercase segment folders under `src/app`.
- Imports: Prefer `@/...` alias; group external before internal.
- Styling: Tailwind v4; compose with `clsx`/`cva` where applicable.

## Testing Guidelines
- Unit tests: Vitest is configured in `vitest.config.ts`; tests live under `tests/`.
  - Run: `npm install` then `npm test` (or `npm run test:watch`).
  - Examples included for protocol schemas and booster generation (with Prisma mocked).
- Node scripts: you can still run `node test-*.js` / `debug-*.js` for ad-hoc checks.
- Coverage/e2e can be added later; keep tests deterministic and avoid network/real DB.

## Rules & Reference Data
- Rulebook: `reference/SorceryRulebook.pdf` is the authoritative gameplay rules. Use it to validate mechanics, timing, and corner cases.
- Codex: `reference/codex.csv` lists canonical card data. Prefer API ingestion (`npm run ingest:cards`) and use the codex to cross-check names, rarities, and set slugs when discrepancies arise.
- Cards snapshot: `data/cards_raw.json` contains all cards across sets (written by `npm run ingest:cards`). Treat as read-only; regenerate instead of editing by hand.
- Suggested workflow: after ingestion, spot-check a few cards against the codex; for rules UX or tooltips, source text from the API/DB and confirm semantics with the PDF.
- Validation: run `npm run validate:cards` to compare the DB against `data/cards_raw.json` and `reference/codex.csv` (names, rarities, and variant slugs). Prints concise diffs and samples.

## Commit & Pull Request Guidelines
- History is informal; adopt concise, imperative messages moving forward. Prefer Conventional Commits when feasible.
  - Examples: `feat(lobby): add ready state`, `fix(auth): restore Discord callback`.
- PRs should include:
  - Clear description, linked issues (e.g., `Closes #123`).
  - Screenshots/GIFs for UI changes.
  - DB changes: update `schema.prisma`, run `npm run prisma:generate`, and note migration/seed steps.
  - Local testing notes (commands used).

## Security & Configuration Tips
- Secrets live in `.env` (NextAuth/Discord, etc.); do not commit. SQLite dev DB is local (`file:./dev.db`).
- CORS for the Socket server allows `http://localhost:3000` by default; adjust before deploying.
