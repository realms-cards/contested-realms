## 1. Implementation

- [ ] 1.1 Add Prisma models for custom playmats and user selection (Postgres bytes)
- [ ] 1.2 Add authenticated API routes for playmats
  - [ ] 1.2.1 List my playmats (metadata)
  - [ ] 1.2.2 Create/upload playmat (accept exported PNG)
  - [ ] 1.2.3 Fetch playmat image bytes (owner-only)
  - [ ] 1.2.4 Delete playmat
  - [ ] 1.2.5 Set selected playmat
- [ ] 1.3 Add Patron gating utility (server + client) using `User.patronTier`
- [ ] 1.4 Build playmat editor UI
  - [ ] 1.4.1 Upload file
  - [ ] 1.4.2 Pan/zoom editor frame
  - [ ] 1.4.3 Grid overlay preview toggle
  - [ ] 1.4.4 Export 2556×1663 PNG and save
- [ ] 1.5 Build playmat selector UI (standard + custom)
- [ ] 1.6 Wire selection into board `playmatUrl` (offline, online, deck editor)
- [ ] 1.7 Add basic tests for API auth + limits

## 2. Verification

- [ ] 2.1 Confirm exported playmat is exactly 2556×1663
- [ ] 2.2 Confirm non-Patrons cannot access editor or API endpoints
- [ ] 2.3 Confirm users can store up to 5 playmats, and cannot exceed limit
- [ ] 2.4 Confirm selected playmat persists across refresh and is used in matches
