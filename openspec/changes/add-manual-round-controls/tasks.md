## 1. Implementation
- [x] 1.1 Audit current round auto-advance logic and identify entry points to disable automatic round completion.
- [x] 1.2 Add host-only actions: end round, end match as invalid/bye, start next round.
- [x] 1.3 Update tournament services to:
      - detect "round ready to end" (all matches completed or invalidated)
      - generate next-round pairings after host ends the round
      - keep next round in pending state until host starts it
      - complete tournament only when host ends the final round
- [x] 1.4 Update realtime events and API responses with round readiness state and pending pairings.
- [x] 1.5 Update tournament UI to surface:
      - round ready/awaiting host
      - host controls for end round, end match as invalid/bye, start next round
- [x] 1.6 Update match handling to support invalid/bye outcomes without breaking standings.

## 2. Tests
- [ ] 2.1 Add unit tests for round readiness and manual round completion.
- [ ] 2.2 Add tests for invalid/bye match handling and standings impact.
- [ ] 2.3 Add integration coverage for manual round end → next round start → final completion.
