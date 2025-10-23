## 1. Implementation
- [ ] 1.1 Create floating shared chat component `src/components/chat/FloatingChat.tsx`
- [ ] 1.2 Wire floating chat to tournament chat channel via `useRealtimeTournaments().sendTournamentChat` and socket `TOURNAMENT_CHAT`
- [ ] 1.3 Replace in-page chat on `src/app/tournaments/[id]/page.tsx` with floating chat; remove redundant chat controls
- [ ] 1.4 Add roster component `src/components/tournament/TournamentRoster.tsx` (names, presence, status)
- [ ] 1.5 Derive statuses from `statistics` (rounds/matches/prep) + presence; show playing vs X during active round
- [ ] 1.6 Add instant join CTA logic in `RealtimeTournamentContext` on `roundStarted`/`matchAssigned`
- [ ] 1.7 Expose `myAssignedMatchId` and emit a browser event `tournament:matchAssigned` with opponent info
- [ ] 1.8 In `src/app/tournaments/[id]/page.tsx`, listen for `tournament:matchAssigned` and render CTA (and optional auto-join)
- [ ] 1.9 Ensure bootstrap payload to `/online/play/[id]` includes tournament context (matchType, lobbyName, sealed/draft config)
- [ ] 1.10 Add Events tab to floating chat dock to show tournament events (joined/left, disconnected/reconnected, phase, round, match assignment, preparation updates)
- [ ] 1.11 Capture events from `RealtimeTournamentContext` handlers and append to an in-memory log (retain last 200)
- [ ] 1.12 Trigger toast on high-priority events (round started, match assigned) when dock is collapsed
- [ ] 1.13 Add basic filters (Players, Phases, Matches, Mine) and a clear button; ensure accessibility
- [ ] 1.14 Prune strategy and perf guardrails (debounce batching, avoid re-render storms)

## 2. QA and UX
- [ ] 2.1 Verify floating chat shows toast while collapsed and opens to chat tab
- [ ] 2.2 Verify roster reflects real-time changes (join/leave/ready/draft/playing)
- [ ] 2.3 Verify CTA appears within ~2s after round start for assigned players
- [ ] 2.4 Verify navigation to match works for sealed/draft/constructed with correct bootstrap
- [ ] 2.5 Accessibility: focus order, Escape to close, labels, reduced motion friendly toasts
- [ ] 2.6 Verify events feed receives, filters, and prunes updates; toasts for high-priority events while collapsed

## 3. Tests & Docs
- [ ] 3.1 Add unit/integration tests for roster derivation, match assignment signals, and events feed formatting/filters
- [ ] 3.2 Update `examples/tutorial-bot-integration.md` (N/A)
- [ ] 3.3 Update README/Docs for tournament UX behavior and the new chat component
