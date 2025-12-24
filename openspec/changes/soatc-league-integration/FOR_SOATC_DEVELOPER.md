# SOATC League Integration - Developer Guide

Hi! This document explains how Realms.cards integrates with the SOATC ranking system at https://ranking.sorcerersatthecore.com.

## Overview

We enable SOATC tournament participants to:

1. Link their SOATC UUID to their Realms.cards account
2. Play official tournament matches on Realms.cards
3. Get a signed result object they can submit to your system
4. (Future) Have results automatically posted to your system

## How It Works

### User Setup

1. User gets their SOATC UUID from their profile at https://ranking.sorcerersatthecore.com
2. User enters the UUID in Realms.cards User Settings
3. User optionally enables "Auto-detect SOATC tournament matches"

### Match Detection

We query your API to find ongoing tournaments where `realms_cards_allowed: true`:

```
GET https://ranking.sorcerersatthecore.com/api/tournaments?state=ongoing&realms_cards_allowed=true
Authorization: Bearer <SORCERERS_AT_THE_CORE_APITOKEN>
```

When two players start a match, we check if both are participants in the same tournament. If so, we flag it as a league match.

### Result Export

After the match, both players see a "SOATC League Result" card with:

- Copy to Clipboard button
- Download JSON button
- Instructions for submission

---

## What We Need From You

### 1. Shared Secret (Optional for Phase 1)

We'll sign all result objects with HMAC-SHA256 so you can verify they came from us.

**Action needed:** Exchange a shared secret (generate with `openssl rand -base64 32`)

### 2. Result Submission Method

For Phase 1, players copy/paste the result JSON. Where should they submit it?

- Discord bot command? (e.g., `/submit-result <paste JSON>`)
- Web form on your ranking site?
- Something else?

---

## What We Provide

### League Match Result Object

After a league match ends, both players see this JSON object:

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

### Field Descriptions

| Field                | Type           | Description                                               |
| -------------------- | -------------- | --------------------------------------------------------- |
| `matchId`            | string         | Unique Realms.cards match identifier                      |
| `tournamentId`       | string         | SOATC tournament UUID                                     |
| `tournamentName`     | string         | Tournament display name                                   |
| `player1`, `player2` | object         | Player info with SOATC UUID, display name, Realms user ID |
| `winnerId`           | string \| null | SOATC UUID of winner (null if draw)                       |
| `loserId`            | string \| null | SOATC UUID of loser (null if draw)                        |
| `isDraw`             | boolean        | True if match ended in a draw                             |
| `format`             | string         | "constructed", "sealed", or "draft"                       |
| `startedAt`          | string         | ISO 8601 timestamp when match started                     |
| `completedAt`        | string         | ISO 8601 timestamp when match ended                       |
| `durationSeconds`    | number         | Match duration in seconds                                 |
| `replayId`           | string \| null | Replay identifier (if available)                          |
| `replayUrl`          | string \| null | Direct link to watch the replay                           |
| `timestamp`          | string         | When this result object was generated                     |
| `signature`          | string         | HMAC-SHA256 signature for verification                    |

### Signature Verification

To verify a result is authentic:

```javascript
const crypto = require("crypto");

function verifySignature(result, sharedSecret) {
  const { signature, ...payload } = result;
  const expectedSignature = crypto
    .createHmac("sha256", sharedSecret)
    .update(JSON.stringify(payload))
    .digest("hex");
  return signature === expectedSignature;
}

// Usage
const isValid = verifySignature(
  receivedResult,
  process.env.SOATC_SHARED_SECRET
);
if (!isValid) {
  throw new Error("Invalid signature - result may be tampered");
}
```

```python
import hmac
import hashlib
import json

def verify_signature(result: dict, shared_secret: str) -> bool:
    signature = result.pop('signature', None)
    if not signature:
        return False
    payload = json.dumps(result, separators=(',', ':'), sort_keys=False)
    expected = hmac.new(
        shared_secret.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)
```

**Important:** The signature is computed on the JSON-stringified payload (without the signature field). We use default JSON.stringify() with no sorting.

---

## Integration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      USER EXPERIENCE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Player signs in to Realms.cards via Discord                 │
│                                                                 │
│  2. Player joins a lobby                                        │
│     → We check: Are they in SOATC server?                       │
│     → We check: Are they in current league? (via your API)      │
│                                                                 │
│  3. Both players are league participants                        │
│     → Host sees checkbox: "☐ Count as SOATC League Match"       │
│                                                                 │
│  4. Host checks the box and starts match                        │
│                                                                 │
│  5. Match plays out normally                                    │
│                                                                 │
│  6. Match ends                                                  │
│     → Both players see "League Result" card                     │
│     → Click "Copy Result" to copy JSON                          │
│     → Paste into your submission system                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Questions for You

1. **Participants API URL and auth method?**

2. **Where should players paste the result?**

   - Discord bot?
   - Web form?
   - Both?

3. **Do you need any additional fields?**

   - Avatar names?
   - Deck archetypes?
   - Turn count?
   - Game-by-game breakdown (for best-of-3)?

4. **Shared secret exchange** - DM me securely?

5. **Timeline** - When do you want this live?

---

## Phase 2 (Future): Automated Webhook

Once Phase 1 is working, we can add server-to-server posting:

```
POST https://your-domain.com/api/league/results
Content-Type: application/json
X-Signature: <HMAC-SHA256>

{
  "matchId": "...",
  ...same fields as above...
}
```

This removes the copy/paste step entirely.

---

## Contact

Let me know if you have questions or want to adjust the schema!

Discord Server ID for reference: `760593198501330964` (Sorcerers at the Core)
