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
