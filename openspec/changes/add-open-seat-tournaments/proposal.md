## Why
- Tournaments currently require a fixed player cap and prevent registration changes once they start.
- Hosts need a flexible "open seat" format where registration can stay fluid, and replacements can step in without restarting the event.
- Drops currently remove player records, which breaks continuity for drafts/constructed decklists.

## What Changes
- Add a new tournament registration mode: **open seat**.
- Allow hosts to lock/unlock registration in open seat tournaments; unlocked means new players can join or take over vacant seats.
- Support mid-event drops by marking seats as vacant while preserving the seat's deck and record.
- Define replacement rules: new players inherit the vacated seat's deck and standings; rejoin is allowed if the seat is still vacant.
- Update API, validation, and UI to expose open seat creation, lock state, and vacancy/replacement workflows.

## Impact
- Affected specs: `specs/tournament-management/spec.md` (new capability).
- Affected code:
  - API routes: `src/app/api/tournaments/**`
  - Tournament services/pairing/standings: `src/lib/tournament/**`, `src/lib/services/**`, `server/**`
  - Prisma schema: `prisma/schema.prisma`
  - UI: `src/components/online/LobbiesCentral.tsx`, tournament pages and lobby pages
