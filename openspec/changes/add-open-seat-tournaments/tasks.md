## 1. Implementation
- [ ] 1.1 Update Prisma schema with open seat fields (`SeatStatus`, `seatStatus`, `seatMeta`) and regenerate client.
- [ ] 1.2 Extend tournament validation/constants to support open seat mode and registration lock state.
- [ ] 1.3 Add API endpoints/handlers for locking/unlocking open seat registration and for seat replacement joins.
- [ ] 1.4 Update join/leave/start flows to support open seat rules, vacancy tracking, and forfeits.
- [ ] 1.5 Implement seat identity transfer across standings, matches, and player decks on replacement.
- [ ] 1.6 Update tournament broadcast events and presence snapshots to include lock/vacant seat info.
- [ ] 1.7 Update UI to create/manage open seat tournaments and visualize vacant seats.
- [ ] 1.8 Add tests for open seat join/leave/replace and lock/unlock behavior.
