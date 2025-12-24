# SOATC League Integration - Tasks

## Phase 1: MVP (Manual Result Export)

### 1. Database Schema

- [x] 1.1 Add `soatcUuid` (String?) and `soatcAutoDetect` (Boolean, default false) to User model
- [x] 1.2 Create `SoatcMatchResult` model for league match history
- [x] 1.3 Run Prisma migration

### 2. SOATC API Service

- [x] 2.1 Create `src/lib/soatc/api.ts` with tournament fetching functions
- [x] 2.2 Implement in-memory caching with 5-minute TTL
- [x] 2.3 Add `checkTournamentParticipation(soatcUuid)` function
- [x] 2.4 Handle API errors gracefully with fallback to cached data

### 3. User Settings UI

- [x] 3.1 Add SOATC section to User Settings (`/settings/soatc` page)
- [x] 3.2 Add UUID input field with validation (UUID format)
- [x] 3.3 Add "Auto-detect SOATC tournament matches" checkbox
- [x] 3.4 Create API route `PATCH /api/users/me/soatc` for saving preferences

### 4. Tournament Participant Detection

- [x] 4.1 Create API route `GET /api/soatc/status` returning user's tournament participation
- [x] 4.2 Add React hook `useSoatcStatus()` for client-side status
- [x] 4.3 Create API route `GET /api/soatc/shared` to check if both players are in same tournament

### 5. Lobby UI Integration

- [x] 5.1 Create `SoatcLeagueBadge` component for showing tournament participation
- [x] 5.2 Create `SoatcLeagueCheckbox` component for host to flag league matches
- [ ] 5.3 Integrate components into lobby page (requires lobby page modification)
- [ ] 5.4 Store `isLeagueMatch` and tournament context in match state (requires server changes)

### 6. Result Object Generation

- [x] 6.1 Create `src/lib/soatc/result.ts` with `generateLeagueMatchResult()` function
- [x] 6.2 Implement HMAC-SHA256 signing with `SOATC_SHARED_SECRET`
- [x] 6.3 Include tournament context (id, name) in result object

### 7. Match End UI

- [x] 7.1 Create `SoatcLeagueResultCard` component with copy/download buttons
- [ ] 7.2 Integrate result card into match end overlay (requires match end page modification)
- [x] 7.3 "Copy to Clipboard" button implemented
- [x] 7.4 "Download JSON" button implemented
- [x] 7.5 Instructions link to SOATC ranking site

### 8. League Match History

- [x] 8.1 Create API route `POST /api/soatc/matches` to persist league match results
- [x] 8.2 Create API route `GET /api/soatc/matches` for user's match history
- [ ] 8.3 Create league match history page/section in UI
- [ ] 8.4 Add "Export All" button for JSON download of all matches

### 9. Environment & Feature Flag

- [x] 9.1 Add `SOATC_LEAGUE_ENABLED`, `SORCERERS_AT_THE_CORE_APITOKEN`, `SOATC_SHARED_SECRET` to example.env
- [x] 9.2 Gate all SOATC features behind `SOATC_LEAGUE_ENABLED` check
- [x] 9.3 Update `example.env` with new variables

### 10. Testing & Documentation

- [ ] 10.1 Add unit tests for HMAC signing and result generation
- [ ] 10.2 Add unit tests for tournament participation detection
- [ ] 10.3 Test with your SOATC UUID: `01990bff-77c3-7324-98bb-8adeae88a4cb`
- [x] 10.4 Updated FOR_SOATC_DEVELOPER.md with UUID-based integration details

## Phase 2: Automated Webhook (Future)

- [ ] 11.1 Add callback URL support to SOATC service
- [ ] 11.2 Implement server-to-server POST on match end
- [ ] 11.3 Add retry logic for failed webhook calls
- [ ] 11.4 Add webhook status to admin dashboard

## Dependencies

**From SOATC (available):**

- [x] Tournament API: `GET /api/tournaments?state=ongoing&realms_cards_allowed=true`
- [x] Tournament details: `GET /api/tournaments/{uuid}` with participant list
- [x] API token provided: `SORCERERS_AT_THE_CORE_APITOKEN`

**From SOATC (pending):**

- [ ] Shared secret for HMAC signatures (optional for Phase 1)
- [ ] Confirmation of result submission method (Discord bot, web form, etc.)

**From Realms.cards (ready):**

- [x] User model and settings infrastructure
- [x] Match result recording infrastructure
- [x] Lobby state management
