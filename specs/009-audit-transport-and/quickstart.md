# Quickstart: Tournament Flow Fixes

**Feature**: 009-audit-transport-and
**Goal**: Validate that tournament phase transitions, draft initialization, and standings updates work correctly without manual reloads, request loops, or data loss.

---

## Prerequisites

1. **Database**: PostgreSQL running with `sorcery_dev` database
2. **Server**: Socket.IO server running on port 3010
3. **Environment Variables**:
   ```bash
   SOCKET_SERVER_URL=http://localhost:3010
   NEXT_PUBLIC_WS_URL=http://localhost:3010
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

4. **Test Accounts**: Create 8 test users (for 8-player draft tournament)

---

## Test Scenario 1: Phase Transition Without Reload

**Goal**: Verify `PHASE_CHANGED` events reach clients automatically

### Steps

1. **Create Tournament**:
   ```bash
   curl -X POST http://localhost:3000/api/tournaments \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Phase Transition Test",
       "format": "draft",
       "settings": {
         "pairingFormat": "swiss",
         "totalRounds": 3
       }
     }'
   ```
   *Expected*: Returns `{ "id": "tournament_123", ... }`

2. **Register 8 Players**:
   ```bash
   for i in {1..8}; do
     curl -X POST http://localhost:3000/api/tournaments/tournament_123/register \
       -H "Content-Type: application/json" \
       -d "{\"playerId\": \"player_$i\", \"playerName\": \"Player $i\"}"
   done
   ```
   *Expected*: All return `200 OK`

3. **Open Tournament Page in Browser**:
   - Navigate to `http://localhost:3000/tournaments/tournament_123`
   - **DO NOT** refresh page for rest of test
   - Keep browser console open

4. **Start Tournament** (via API):
   ```bash
   curl -X POST http://localhost:3000/api/tournaments/tournament_123/start
   ```

5. **Verify Client Updates Automatically**:
   - **Expected**: Page shows "Tournament Status: Preparing" → "Active" without reload
   - **Expected**: Console shows `PHASE_CHANGED` event received
   - **Expected**: Draft lobby appears automatically

### Success Criteria

- ✅ Page updates to show "Preparing" phase without reload
- ✅ Browser console shows exactly 1 `PHASE_CHANGED` event (no duplicates)
- ✅ No request loops (check Network tab: should see <5 requests)
- ✅ Draft lobby appears within 2 seconds

### Failure Indicators

- ❌ Page doesn't update (need manual reload)
- ❌ Multiple `PHASE_CHANGED` events (request loop)
- ❌ 10+ API requests in Network tab (broadcast loop)
- ❌ Draft lobby never appears

---

## Test Scenario 2: Cube Draft in Production Mode

**Goal**: Verify cube drafts work identically in production environment

### Steps

1. **Create Cube**:
   ```bash
   curl -X POST http://localhost:3000/api/cubes \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Test Cube",
       "cardIds": ["card_1", "card_2", ..., "card_360"]  # 360 cards
     }'
   ```
   *Expected*: Returns `{ "id": "cube_123", ... }`

2. **Create Tournament with Cube Draft**:
   ```bash
   curl -X POST http://localhost:3000/api/tournaments \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Cube Draft Test",
       "format": "draft",
       "settings": {
         "draftType": "cube",
         "cubeId": "cube_123",
         "packCount": 3,
         "packSize": 15
       }
     }'
   ```

3. **Register 8 Players and Start** (same as Scenario 1)

4. **Join Draft as Player 1**:
   - Navigate to draft lobby
   - Emit `draft:session:join` via Socket.IO
   - **DO NOT** retry join manually

5. **Verify Cube Packs Generated**:
   - Check first pack contains exactly 15 cards
   - Verify cards are from cube (not Beta/Unlimited sets)
   - Log pack contents: `console.log(draftState.currentPacks[0])`

### Success Criteria

- ✅ Draft starts without errors
- ✅ Packs contain cube cards (not default set cards)
- ✅ Pack size is 15 cards
- ✅ All 8 players receive packs
- ✅ No "Draft configuration incomplete" errors

### Failure Indicators

- ❌ Draft starts with Beta/Unlimited cards instead of cube cards
- ❌ Error: "cubeId is undefined"
- ❌ Pack size is wrong (e.g., 14 or 16 cards)
- ❌ Some players don't receive packs

---

## Test Scenario 3: Concurrent Match Completions (Standings Race)

**Goal**: Verify standings updates are atomic (no data loss in race conditions)

### Steps

1. **Create Tournament with 4 Players**:
   ```bash
   curl -X POST http://localhost:3000/api/tournaments \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Standings Test",
       "format": "constructed",
       "settings": { "totalRounds": 1 }
     }'
   ```

2. **Register 4 Players** (P1, P2, P3, P4)

3. **Start Tournament** (creates 2 matches: P1 vs P2, P3 vs P4)

4. **Complete Both Matches Simultaneously**:
   ```bash
   # In terminal 1:
   curl -X POST http://localhost:3000/api/tournaments/matches/match_1/result \
     -H "Content-Type: application/json" \
     -d '{"winnerId": "player_1", "loserId": "player_2"}' &

   # In terminal 2 (immediately):
   curl -X POST http://localhost:3000/api/tournaments/matches/match_2/result \
     -H "Content-Type: application/json" \
     -d '{"winnerId": "player_3", "loserId": "player_4"}' &

   wait
   ```

5. **Verify Standings**:
   ```bash
   curl http://localhost:3000/api/tournaments/tournament_123/standings
   ```

### Success Criteria

- ✅ P1: `wins=1, losses=0, matchPoints=3`
- ✅ P2: `wins=0, losses=1, matchPoints=0`
- ✅ P3: `wins=1, losses=0, matchPoints=3`
- ✅ P4: `wins=0, losses=1, matchPoints=0`
- ✅ All 4 players have correct records (no missing updates)
- ✅ Database transaction log shows atomic updates

### Failure Indicators

- ❌ One player's standings missing (e.g., P1 has 0-0-0)
- ❌ matchPoints incorrect (e.g., P1 has wins=1 but matchPoints=0)
- ❌ Database error logs show transaction conflicts
- ❌ Standings don't match expected values

---

## Test Scenario 4: Draft Join Without Retry Loops

**Goal**: Verify draft join succeeds without spamming server with requests

### Steps

1. **Setup**: Create and start 8-player draft tournament

2. **Monitor Server Logs**:
   ```bash
   tail -f server/logs/socket.log | grep "draft:session:join"
   ```

3. **Join Draft**:
   - Open browser to tournament page
   - Wait for draft to start
   - Join draft lobby

4. **Count Join Requests**:
   - Check server logs for `draft:session:join` events
   - Count how many requests received from single client

### Success Criteria

- ✅ Client sends ≤3 join requests (initial + max 2 retries)
- ✅ Join acknowledged within 1 second
- ✅ Client stops retrying after successful join
- ✅ No server errors in logs

### Failure Indicators

- ❌ Client sends 10+ join requests (retry loop)
- ❌ Server log shows "draft:session:join" every 500ms
- ❌ Join never acknowledged (client stuck retrying)
- ❌ Server CPU spikes due to request spam

---

## Test Scenario 5: Environment Variable Validation

**Goal**: Verify production deployment catches missing environment variables

### Steps

1. **Run Validation Script**:
   ```bash
   scripts/validate-socket-env.sh
   ```

2. **Test with Missing Variable**:
   ```bash
   unset SOCKET_SERVER_URL
   scripts/validate-socket-env.sh
   ```
   *Expected*: Script exits with error

3. **Test with Wrong URL**:
   ```bash
   export SOCKET_SERVER_URL=http://wrong-host:9999
   scripts/validate-socket-env.sh
   ```
   *Expected*: Script detects unreachable server

4. **Test with Correct Config**:
   ```bash
   export SOCKET_SERVER_URL=http://localhost:3010
   export NEXT_PUBLIC_WS_URL=http://localhost:3010
   scripts/validate-socket-env.sh
   ```
   *Expected*: `✓ Socket environment valid`

### Success Criteria

- ✅ Script detects missing `SOCKET_SERVER_URL`
- ✅ Script detects unreachable socket server
- ✅ Script validates all required variables
- ✅ Script exits with code 1 on failure, 0 on success

### Failure Indicators

- ❌ Script passes when variables missing
- ❌ Script doesn't detect wrong URL
- ❌ Script has false positives (fails when config is valid)

---

## Performance Benchmarks

### Broadcast Latency

**Measurement**:
```typescript
const start = Date.now();
await broadcastPhaseChanged(tournamentId, 'active');
const latency = Date.now() - start;
console.log('Broadcast latency:', latency, 'ms');
```

**Target**: <100ms
**Acceptable**: <200ms
**Failure**: >500ms

### Standings Update

**Measurement**:
```typescript
const start = Date.now();
await recordMatchResult(tournamentId, winnerId, loserId, false);
const latency = Date.now() - start;
console.log('Standings update latency:', latency, 'ms');
```

**Target**: <10ms
**Acceptable**: <50ms
**Failure**: >100ms

### Draft Config Hydration

**Measurement**:
```typescript
const start = Date.now();
await ensureConfigLoaded(matchId);
const latency = Date.now() - start;
console.log('Config hydration latency:', latency, 'ms');
```

**Target**: <20ms (cached)
**Acceptable**: <100ms (first load)
**Failure**: >500ms

---

## Cleanup

After testing, clean up database:

```bash
# Delete test tournaments
psql sorcery_dev -c "DELETE FROM tournaments WHERE name LIKE '%Test%';"

# Delete test users
psql sorcery_dev -c "DELETE FROM users WHERE username LIKE 'player_%';"

# Delete test cubes
psql sorcery_dev -c "DELETE FROM cubes WHERE name LIKE 'Test%';"
```

---

## Troubleshooting

### Issue: Page doesn't update after phase change

**Diagnosis**:
1. Check browser console for Socket.IO connection status
2. Verify `PHASE_CHANGED` event received
3. Check Network tab for broadcast POST request

**Possible Causes**:
- Socket.IO not connected (check `NEXT_PUBLIC_WS_URL`)
- Broadcast service URL wrong (`SOCKET_SERVER_URL` != socket server)
- Event handler not registered (check `useTournamentSocket` hook)

### Issue: Cube draft generates wrong cards

**Diagnosis**:
1. Check server logs for draft config loading
2. Query `DraftSession` table for `cubeId` in settings
3. Check `match.draftConfig.cubeId` in server memory

**Possible Causes**:
- Draft config not hydrated before pack generation
- `cubeId` missing from DraftSession settings
- Match loaded from cache instead of database

### Issue: Standings update fails

**Diagnosis**:
1. Check database logs for transaction errors
2. Verify `PlayerStanding` records exist for both players
3. Check for transaction conflicts (P2034 error code)

**Possible Causes**:
- Database transaction timeout
- Concurrent updates to same player
- Foreign key violation (player not in tournament)

---

## Success Metrics

After all scenarios pass:

- **Zero manual reloads** required during tournament flow
- **Zero request loops** detected in Network tab
- **Zero standings data loss** in concurrent updates
- **100% cube draft success rate** (production = development)
- **<2 second latency** for phase transitions
- **<5 retry attempts** for draft join

If all metrics met: **Feature is production-ready** ✅
