# SOATC League Integration

## Summary

Integrate Realms.cards with the "Sorcerers at the Core" (SOATC) Discord community's monthly tournament/league system. This enables league participants to play official matches on Realms.cards and export results for submission to the SOATC ranking system at https://ranking.sorcerersatthecore.com.

## Problem Statement

The SOATC community runs monthly tournaments with match tracking and ELO-based leaderboards. Currently, there's no way to:

1. Link a Realms.cards user to their SOATC account
2. Know if they're participating in an ongoing SOATC tournament
3. Automatically detect when two tournament participants are playing each other
4. Export match results in a format the SOATC ranking system can consume
5. View historical league match data

## Proposed Solution

### Phase 1: Manual Result Export (MVP)

1. **SOATC UUID Linking**

   - User enters their SOATC UUID in User Settings (from https://ranking.sorcerersatthecore.com)
   - Store as `User.soatcUuid` in database
   - User opts in via checkbox: "Auto-detect SOATC tournament matches"

2. **Tournament Participant Detection**

   - Query SOATC API: `GET /api/tournaments?state=ongoing&realms_cards_allowed=true`
   - For each ongoing tournament, check if user's SOATC UUID is in participants list
   - Cache tournament data with 5-minute TTL to minimize API calls

3. **League Match Detection**

   - When both players have opted in AND both are participants in the same ongoing tournament:
     - Auto-flag match as `isLeagueMatch: true` with tournament context
   - When only one player is a participant or opt-in differs:
     - Show optional checkbox to host: "Count as SOATC League Match?"

4. **Result Object Export**

   - After match ends, generate result object with SOATC UUIDs
   - Display to both players with "Copy to Clipboard" and "Download JSON" buttons
   - Include instructions for submitting to SOATC

5. **Historical Match Export**
   - Store league match results in database with tournament context
   - Provide exportable list of historical SOATC matches per user

### Phase 2: Automated Webhook (Future)

- POST results directly to SOATC callback URL (server-to-server)
- Requires shared secret for HMAC signature verification

## Integration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         REALMS.CARDS                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. User enters SOATC UUID in settings                          │
│     └─> Stored as User.soatcUuid                                │
│     └─> User enables "Auto-detect SOATC tournament matches"     │
│                                                                 │
│  2. User joins lobby / starts match                             │
│     └─> Query cached SOATC tournaments (ongoing, realms_cards)  │
│     └─> Check: Is user's UUID in any tournament participant list│
│     └─> Cache result for session                                │
│                                                                 │
│  3. Both players are tournament participants (same tournament)  │
│     └─> Auto-flag as league match (if both opted in)            │
│     └─> Or show checkbox to host                                │
│                                                                 │
│  4. Match completes                                             │
│     └─> Generate LeagueMatchResult object                       │
│     └─> Sign with HMAC (shared secret)                          │
│     └─> Display to players for manual submission                │
│     └─> Store in league match history                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         SOATC RANKING SYSTEM                    │
│              https://ranking.sorcerersatthecore.com             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Provides (API with Bearer token auth):                         │
│  - GET /api/tournaments                                         │
│    Filters: state=ongoing, realms_cards_allowed=true            │
│    Returns: { data: [{ id, name, participants: [...] }] }       │
│                                                                 │
│  - GET /api/tournaments/{uuid}                                  │
│    Returns: tournament details with full participant list       │
│                                                                 │
│  Accepts:                                                       │
│  - LeagueMatchResult object (copied by player, submitted via    │
│    Discord bot or web form - TBD by SOATC team)                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Data Requirements

### From SOATC (they provide)

1. **Tournament API** (already available at ranking.sorcerersatthecore.com)

   ```
   GET https://ranking.sorcerersatthecore.com/api/tournaments?state=ongoing&realms_cards_allowed=true
   Authorization: Bearer <SORCERERS_AT_THE_CORE_APITOKEN>

   Response:
   {
     "data": [{
       "id": "uuid",
       "name": "December 2024 Monthly League",
       "game_type": "constructed",
       "is_ongoing": true,
       "realms_cards_allowed": true,
       "participants": [
         { "id": "uuid", "name": "Player Name", "email_hash": "..." }
       ]
     }]
   }
   ```

2. **Shared Secret** for HMAC signatures (exchanged out-of-band, optional for Phase 1)

### From Realms.cards (we provide)

**LeagueMatchResult Object**

```typescript
interface LeagueMatchResult {
  // Identifiers
  matchId: string; // Realms.cards match UUID
  tournamentId: string; // SOATC tournament UUID
  tournamentName: string; // e.g., "December 2024 Monthly League"

  // Players (SOATC UUIDs)
  player1: {
    soatcUuid: string;
    displayName: string;
    realmsUserId: string; // Realms.cards user ID (for cross-reference)
  };
  player2: {
    soatcUuid: string;
    displayName: string;
    realmsUserId: string;
  };

  // Result
  winnerId: string | null; // SOATC UUID of winner, null if draw
  loserId: string | null; // SOATC UUID of loser, null if draw
  isDraw: boolean;

  // Match metadata
  format: "constructed" | "sealed" | "draft";
  startedAt: string; // ISO 8601
  completedAt: string; // ISO 8601
  durationSeconds: number;

  // Verification
  replayId: string | null; // For dispute resolution
  replayUrl: string | null; // Direct link to replay

  // Integrity
  timestamp: string; // When this object was generated
  signature: string; // HMAC-SHA256(payload, sharedSecret)
}
```

## Example Result Object

```json
{
  "matchId": "cm4abc123def456ghi789",
  "tournamentId": "01990bff-77c3-7324-98bb-8adeae88a4cb",
  "tournamentName": "December 2024 Monthly League",
  "player1": {
    "soatcUuid": "01990bff-77c3-7324-98bb-8adeae88a4cb",
    "displayName": "KingArthur",
    "realmsUserId": "clxyz789abc123"
  },
  "player2": {
    "soatcUuid": "02990bff-88d4-8435-99cc-9bdfbf99b5db",
    "displayName": "Merlin",
    "realmsUserId": "clxyz790def456"
  },
  "winnerId": "01990bff-77c3-7324-98bb-8adeae88a4cb",
  "loserId": "02990bff-88d4-8435-99cc-9bdfbf99b5db",
  "isDraw": false,
  "format": "constructed",
  "startedAt": "2025-01-15T14:30:00.000Z",
  "completedAt": "2025-01-15T15:05:32.000Z",
  "durationSeconds": 2132,
  "replayId": "cm4replay789xyz",
  "replayUrl": "https://realms.cards/replay/cm4replay789xyz",
  "timestamp": "2025-01-15T15:05:35.000Z",
  "signature": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678"
}
```

## Environment Variables

```bash
# SOATC League Integration
SOATC_LEAGUE_ENABLED=true
SORCERERS_AT_THE_CORE_APITOKEN=<bearer-token-from-soatc>
SOATC_SHARED_SECRET=<shared-secret-for-hmac>  # Optional for Phase 1
```

## API Integration Notes

The SOATC ranking system at https://ranking.sorcerersatthecore.com provides:

1. **Tournament List**: `GET /api/tournaments?state=ongoing&realms_cards_allowed=true`
2. **Tournament Details**: `GET /api/tournaments/{uuid}` (includes participant list)
3. **User Profile**: `GET /api/user` (for validating SOATC UUID)

All endpoints require `Authorization: Bearer <token>` header.

## Implementation Effort

| Task                                          | Effort     |
| --------------------------------------------- | ---------- |
| Add `soatcUuid` and `soatcAutoDetect` to User | 1h         |
| Create SOATC API service with caching         | 2h         |
| Add SOATC UUID input to User Settings UI      | 1.5h       |
| Tournament participant detection logic        | 2h         |
| Add league match checkbox to lobby UI         | 1.5h       |
| Generate signed result object on match end    | 2h         |
| Display result with copy/download buttons     | 1h         |
| League match history storage & export         | 2h         |
| Add env vars and feature flag                 | 0.5h       |
| **Total Phase 1**                             | **~13.5h** |

## Risks & Mitigations

| Risk                          | Mitigation                                                          |
| ----------------------------- | ------------------------------------------------------------------- |
| User hasn't linked SOATC UUID | Show prompt in settings with link to SOATC ranking site             |
| SOATC API unavailable         | Cache tournament/participant data with 5-min TTL, graceful fallback |
| Player forgets to copy result | Also email/store in match history                                   |
| Signature tampering           | HMAC with shared secret; include timestamp to prevent replay        |

## Success Criteria

1. Users can see "SOATC League" badge when both players are participants
2. Host can flag match as league match before starting
3. After match, both players see copyable result object
4. SOATC system can verify and accept the result object
