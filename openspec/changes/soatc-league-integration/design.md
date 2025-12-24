# SOATC League Integration - Design

## Context

The Sorcerers at the Core (SOATC) Discord community runs monthly tournaments with an ELO-based ranking system at https://ranking.sorcerersatthecore.com. They want Realms.cards players to be able to play official league matches and export results for submission.

**Stakeholders:**

- SOATC community organizers
- Realms.cards players who participate in SOATC tournaments
- SOATC ranking system developers

**Constraints:**

- SOATC uses UUIDs for user identification, not Discord IDs
- We should minimize API requests to SOATC (rate limiting concerns)
- Phase 1 is manual result submission; Phase 2 may add webhooks

## Goals / Non-Goals

**Goals:**

- Allow users to link their SOATC UUID to their Realms.cards account
- Detect when two tournament participants are playing each other
- Generate signed result objects for league matches
- Store and allow export of historical league match data

**Non-Goals (Phase 1):**

- Automatic result submission to SOATC (future Phase 2)
- Real-time ELO/ranking display from SOATC
- Tournament bracket management

## Decisions

### 1. User Identification: SOATC UUID

**Decision:** Users manually enter their SOATC UUID in settings rather than automatic Discord-based linking.

**Why:**

- SOATC API uses UUIDs, not Discord IDs, for participant identification
- Users get their UUID from their SOATC ranking profile
- Simpler and more reliable than email hash matching

**Alternatives considered:**

- Discord ID lookup via SOATC API - API doesn't support this
- Email hash matching - privacy concerns, complexity
- OAuth integration with SOATC - not available

### 2. Tournament Data Caching

**Decision:** Cache tournament data in memory with 5-minute TTL.

**Why:**

- Minimizes API requests to SOATC
- Tournament participant lists change infrequently during a month
- Fast participant lookups for match detection

**Implementation:**

```typescript
interface TournamentCache {
  data: SoatcTournament[];
  fetchedAt: number;
}
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
```

### 3. Match Detection Flow

**Decision:** Auto-detect when both players have opted in; otherwise show checkbox to host.

**Why:**

- Respects user preference (some may not want every match counted)
- Reduces accidental league match flagging
- Host has final say for non-auto-detect matches

**Flow:**

1. Both players have `soatcAutoDetect: true` AND same tournament → auto-flag
2. Both players in same tournament but different auto-detect settings → show checkbox
3. Only one player in tournament → no league match option

### 4. HMAC Signing

**Decision:** Sign result objects with HMAC-SHA256 using a shared secret.

**Why:**

- Prevents tampering with result objects
- Standard cryptographic approach
- SOATC can verify authenticity before accepting results

**Implementation:**

```typescript
import crypto from "crypto";

function signResult(payload: Omit<LeagueMatchResult, "signature">): string {
  return crypto
    .createHmac("sha256", process.env.SOATC_SHARED_SECRET!)
    .update(JSON.stringify(payload))
    .digest("hex");
}
```

### 5. Result Storage

**Decision:** Store league match results in a dedicated `SoatcMatchResult` table.

**Why:**

- Allows users to view and export historical matches
- Separate from general `MatchResult` table for clear ownership
- Includes tournament context for filtering

**Schema:**

```prisma
model SoatcMatchResult {
  id              String   @id @default(cuid())
  matchId         String   @unique
  tournamentId    String   // SOATC tournament UUID
  tournamentName  String
  player1Id       String
  player1SoatcId  String
  player2Id       String
  player2SoatcId  String
  winnerId        String?
  winnerSoatcId   String?
  isDraw          Boolean  @default(false)
  format          GameFormat
  resultJson      Json     // Full signed result object
  completedAt     DateTime @default(now())

  @@index([player1Id])
  @@index([player2Id])
  @@index([tournamentId])
}
```

## Risks / Trade-offs

| Risk                                   | Mitigation                                               |
| -------------------------------------- | -------------------------------------------------------- |
| SOATC API downtime                     | Cache fallback, graceful degradation with error messages |
| User enters wrong UUID                 | Validation format check; no verification API available   |
| Stale cache during participant changes | 5-min TTL is reasonable; user can refresh page           |
| HMAC secret exposure                   | Store in environment variable, never expose to client    |

## API Integration

### SOATC API Endpoints Used

1. **List Tournaments**

   ```
   GET https://ranking.sorcerersatthecore.com/api/tournaments
   ?state=ongoing&realms_cards_allowed=true
   Authorization: Bearer {SORCERERS_AT_THE_CORE_APITOKEN}
   ```

2. **Tournament Details** (if participant list not in list response)
   ```
   GET https://ranking.sorcerersatthecore.com/api/tournaments/{uuid}
   Authorization: Bearer {SORCERERS_AT_THE_CORE_APITOKEN}
   ```

### Realms.cards API Routes

| Route                 | Method | Purpose                                     |
| --------------------- | ------ | ------------------------------------------- |
| `/api/users/me/soatc` | PATCH  | Save SOATC UUID and preferences             |
| `/api/soatc/status`   | GET    | Get current user's tournament participation |
| `/api/soatc/matches`  | GET    | List user's SOATC league match history      |

## Open Questions

1. **Result Submission Method**: How should players submit the JSON result to SOATC?

   - Discord bot command?
   - Web form on ranking site?
   - Currently TBD by SOATC team

2. **Shared Secret Exchange**: How to securely exchange HMAC secret with SOATC?

   - Direct message to organizer
   - Key rotation process?

3. **Multiple Ongoing Tournaments**: Can a user be in multiple ongoing tournaments?
   - Current design assumes checking all ongoing tournaments
   - May need to let user select which tournament for a match
