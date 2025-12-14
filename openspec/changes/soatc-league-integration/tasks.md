# SOATC League Integration - Tasks

## Phase 1: MVP (Manual Result Export)

### 1. Data Layer

- [ ] 1.1 Add helper to fetch Discord ID from Account table by user ID
- [ ] 1.2 Create SOATC service module (`src/lib/soatc/`) with participant check
- [ ] 1.3 Add environment variables and feature flag (`SOATC_LEAGUE_ENABLED`)

### 2. League Participant Detection

- [ ] 2.1 Create API route `GET /api/soatc/status` returning user's league status
- [ ] 2.2 Add React hook `useSoatcStatus()` for client-side league status
- [ ] 2.3 Cache participant list with configurable TTL (default 5 min)

### 3. Lobby UI Integration

- [ ] 3.1 Show "SOATC League" badge on player cards when both are participants
- [ ] 3.2 Add "Count as League Match" checkbox for host (visible only when both are participants)
- [ ] 3.3 Store `isLeagueMatch` flag in match/lobby state

### 4. Result Object Generation

- [ ] 4.1 Create `generateLeagueMatchResult()` function with HMAC signing
- [ ] 4.2 Add result object to match end state when `isLeagueMatch` is true
- [ ] 4.3 Create `LeagueResultCard` component with copy-to-clipboard button

### 5. Match End UI

- [ ] 5.1 Display `LeagueResultCard` in match end overlay for league matches
- [ ] 5.2 Add "Copy Result" button with success toast
- [ ] 5.3 Show instructions for submitting to SOATC

### 6. Testing & Documentation

- [ ] 6.1 Add unit tests for HMAC signing and result generation
- [ ] 6.2 Add integration test for league status check
- [ ] 6.3 Document API for SOATC developer

## Phase 2: Automated Webhook (Future)

- [ ] 7.1 Add callback URL support to match state
- [ ] 7.2 Implement server-to-server POST on match end
- [ ] 7.3 Add retry logic for failed webhook calls
- [ ] 7.4 Add webhook status to admin dashboard

## Dependencies

**From SOATC (blocking Phase 1):**

- [ ] Participants API endpoint URL and authentication method
- [ ] Shared secret for HMAC signatures
- [ ] Confirmation of result object schema

**From Realms.cards:**

- [x] Discord OAuth already implemented
- [x] Account table stores `providerAccountId` (Discord user ID)
- [x] Match result recording infrastructure exists
