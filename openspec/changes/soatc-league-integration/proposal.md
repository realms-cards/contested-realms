# SOATC League Integration

## Summary

Integrate Realms.cards with the "Sorcerers at the Core" (SOATC) Discord community's monthly league system. This enables league participants to play official league matches on Realms.cards and have results automatically tracked.

## Problem Statement

The SOATC community runs a monthly league with match tracking and leaderboards on a separate platform. Currently, there's no way to:

1. Identify if a Realms.cards user is a member of the SOATC Discord server
2. Know if they're participating in the current month's league
3. Flag matches as "league matches" for official scoring
4. Export match results in a format the league system can consume

## Proposed Solution

### Phase 1: Manual Result Export (MVP)

1. **Discord Server Membership Check**

   - Query Discord API to check if user is member of SOATC server (ID: `760593198501330964`)
   - Requires user's Discord ID (available via `Account.providerAccountId` for Discord provider)

2. **League Participation Flag**

   - SOATC provides an API endpoint or static list of current league participants (Discord IDs)
   - Realms.cards queries this to determine if a user is "playing the league"

3. **League Match Flagging**

   - When both players in a lobby are identified as league participants:
     - Show a prompt to the host: "Both players are SOATC League participants. Count this match for the league?"
     - If confirmed, flag the match as `isLeagueMatch: true`

4. **Result Object Export**
   - After match ends, generate a signed result object
   - Display to both players with a "Copy to Clipboard" button
   - Players can paste this into the SOATC system for verification

### Phase 2: Automated Webhook (Future)

- POST results directly to SOATC callback URL (server-to-server)
- Requires shared secret for HMAC signature verification

## Integration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         REALMS.CARDS                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. User signs in via Discord OAuth                             │
│     └─> We store Account.providerAccountId (Discord user ID)    │
│                                                                 │
│  2. User joins lobby                                            │
│     └─> Check: Is user in SOATC server? (Discord API)           │
│     └─> Check: Is user in current league? (SOATC API)           │
│     └─> Cache result for session                                │
│                                                                 │
│  3. Both players are league participants                        │
│     └─> Host sees: "Count as league match?" checkbox            │
│                                                                 │
│  4. Match completes                                             │
│     └─> Generate LeagueMatchResult object                       │
│     └─> Sign with HMAC (shared secret)                          │
│     └─> Display to players for manual submission                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         SOATC SYSTEM                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Provides:                                                      │
│  - API endpoint: GET /api/league/participants                   │
│    Returns: { participants: ["discord_id_1", "discord_id_2"] }  │
│                                                                 │
│  Accepts:                                                       │
│  - LeagueMatchResult object (pasted by player or via webhook)   │
│  - Verifies HMAC signature before accepting                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Data Requirements

### From SOATC (they provide)

1. **League Participants Endpoint**

   ```
   GET https://soatc-league.example.com/api/participants
   Authorization: Bearer <API_KEY>

   Response:
   {
     "leagueId": "2025-01",
     "leagueName": "January 2025 Monthly League",
     "participants": [
       { "discordId": "123456789", "displayName": "Player1" },
       { "discordId": "987654321", "displayName": "Player2" }
     ]
   }
   ```

2. **Shared Secret** for HMAC signatures (exchanged out-of-band)

### From Realms.cards (we provide)

**LeagueMatchResult Object**

```typescript
interface LeagueMatchResult {
  // Identifiers
  matchId: string; // Realms.cards match UUID
  leagueId: string; // e.g., "soatc-2025-01"

  // Players (Discord IDs)
  player1: {
    discordId: string;
    displayName: string;
    odentifier: string; // Realms.cards user ID (for cross-reference)
  };
  player2: {
    discordId: string;
    displayName: string;
    odentifier: string;
  };

  // Result
  winnerId: string | null; // Discord ID of winner, null if draw
  loserId: string | null; // Discord ID of loser, null if draw
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
  "matchId": "cm4abc123def456",
  "leagueId": "soatc-2025-01",
  "player1": {
    "discordId": "760593198501330964",
    "displayName": "KingArthur",
    "odentifier": "clxyz789"
  },
  "player2": {
    "discordId": "123456789012345678",
    "displayName": "Merlin",
    "odentifier": "clxyz790"
  },
  "winnerId": "760593198501330964",
  "loserId": "123456789012345678",
  "isDraw": false,
  "format": "constructed",
  "startedAt": "2025-01-15T14:30:00.000Z",
  "completedAt": "2025-01-15T15:05:32.000Z",
  "durationSeconds": 2132,
  "replayId": "cm4replay789",
  "replayUrl": "https://realms.cards/replay/cm4replay789",
  "timestamp": "2025-01-15T15:05:35.000Z",
  "signature": "a1b2c3d4e5f6..."
}
```

## Environment Variables

```bash
# SOATC League Integration
SOATC_LEAGUE_ENABLED=true
SOATC_LEAGUE_API_URL=https://soatc-league.example.com/api
SOATC_LEAGUE_API_KEY=<api-key-from-soatc>
SOATC_SHARED_SECRET=<shared-secret-for-hmac>
SOATC_DISCORD_SERVER_ID=760593198501330964
```

## Questions for SOATC Developer

1. **Participants API**: Can you provide an endpoint that returns current league participants by Discord ID?

   - What authentication do you prefer? (API key, none for public, etc.)
   - Should we cache this? What's the refresh interval?

2. **Result Submission**: For Phase 1, players will copy/paste the result object. Where should they paste it?

   - Discord bot command?
   - Web form?
   - Both?

3. **Signature Verification**: Are you comfortable implementing HMAC-SHA256 verification on your end?

   - We can provide sample code in JS/Python/etc.

4. **Additional Fields**: Do you need any other data in the result object?

   - Avatar names?
   - Deck archetypes?
   - Turn count?

5. **Discord Bot**: Do you have a Discord bot that could:
   - Provide the participants list via API?
   - Accept result submissions?

## Implementation Effort

| Task                                       | Effort    |
| ------------------------------------------ | --------- |
| Add Discord ID lookup from Account table   | 1h        |
| Create SOATC participants check service    | 2h        |
| Add "league match" checkbox to lobby UI    | 2h        |
| Generate signed result object on match end | 2h        |
| Display result with copy button            | 1h        |
| Add env vars and feature flag              | 0.5h      |
| **Total Phase 1**                          | **~8.5h** |

## Risks & Mitigations

| Risk                           | Mitigation                                                          |
| ------------------------------ | ------------------------------------------------------------------- |
| User not signed in via Discord | Show message: "Sign in with Discord to participate in SOATC League" |
| SOATC API unavailable          | Cache participants list, graceful degradation                       |
| Player forgets to copy result  | Also email/store in match history                                   |
| Signature tampering            | HMAC with shared secret; include timestamp to prevent replay        |

## Success Criteria

1. Users can see "SOATC League" badge when both players are participants
2. Host can flag match as league match before starting
3. After match, both players see copyable result object
4. SOATC system can verify and accept the result object
