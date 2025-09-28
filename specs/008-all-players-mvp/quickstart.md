# Quickstart: All Players MVP

## Prerequisites
- Repo setup per README.md
- Two terminals:
  - Terminal A: `npm run dev` (Next.js at http://localhost:3000)
  - Terminal B: `npm run server` (Socket.IO server; default http://localhost:3001)

## Manual Validation Steps
1. Sign in and navigate to `/online/lobby` → Friends & Invites → All Players.
2. Verify list shows online, not‑in‑match players only; presence hidden accounts are excluded.
3. Confirm recent opponents (within last 10 matches) appear at the top.
4. Toggle sorting to “Alphabetical” and verify alphabetical order by display name.
5. Search by display name; results narrow correctly and maintain applicable prioritization.
6. Add Friend from an All Players entry; duplication is prevented; UI reflects friend state.
7. Invite a visible/available player; if they become unavailable, feedback is clear and non‑technical.
8. With >100 available players (simulate or seed), initial view shows up to 100; additional entries load as you scroll.

## Notes
- Short human‑friendly UserID must be visible to disambiguate duplicate names.
- Actions must be idempotent; availability may change between render and action.
