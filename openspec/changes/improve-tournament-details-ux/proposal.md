## Why
- Tournament chat on the details page is buried at the bottom and easy to miss.
- Players need a real-time, page-agnostic chat that can surface messages unobtrusively.
- The player count (n/N) lacks a readable roster with status, making it hard to see overall readiness/progress.
- After the host starts a round, assigned matches are not surfaced instantly; players often reload to see a join CTA.

## What Changes
- Floating Shared Chat (bottom-left)
  - Introduce a reusable chat component (floating dock) derived from the Online Console chat tab, usable across pages.
  - First integration: tournament details page uses the floating chat (remove in-page chat controls).
  - Toast preview on new messages when collapsed; debounced to avoid noise.
- Tournament Events Feed
  - Extend the floating dock with an Events tab to display real-time tournament events (player joined/left, disconnected/reconnected, phase changes, round started, match assigned, preparation updates).
  - High-priority events (e.g., match assigned, round started) trigger a toast when the dock is collapsed.
- Tournament Roster with Status
  - Replace/augment the n/N display with a full roster list (name + presence + status).
  - Statuses: joining (registered), ready (preparing), drafting, constructing deck, playing match vs X, bye/waiting.
  - Real-time updates via RealtimeTournamentContext statistics + presence streams.
- Instant Match Join CTA
  - On round start and match assignment, show a prominent "Join Match" CTA within ~2s, no manual reload.
  - Include opponent name and round number; click navigates to /online/play/[matchId] with tournament bootstrap.
  - Optional setting: Auto-join my match (off by default); still show toast.

## Impact
- Affected specs: tournament-roster, shared-chat, tournament-join-experience, tournament-events
- Affected code:
  - Frontend: `src/app/tournaments/[id]/page.tsx`, `src/components/game/OnlineConsole.tsx`, `src/components/chat/` (new), `src/components/tournament/` (new)
  - Context/hooks: `src/contexts/RealtimeTournamentContext.tsx`, `src/hooks/useTournamentStatistics.ts`, `src/hooks/useTournamentSocket.ts`
  - Server (confirm/extend events if needed): `server/modules/tournament/*` and socket handlers
