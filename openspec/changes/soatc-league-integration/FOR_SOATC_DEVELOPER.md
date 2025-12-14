# SOATC League Integration - Developer Guide

Hi! This document explains how Realms.cards can integrate with the SOATC monthly league system.

## Overview

We want to enable SOATC league participants to:

1. Play official league matches on Realms.cards
2. Get a signed result object they can submit to your system
3. (Future) Have results automatically posted to your system

## What We Need From You

### 1. League Participants API

We need an endpoint that returns current league participants by Discord ID.

**Suggested endpoint:**

```
GET https://your-domain.com/api/league/participants
Authorization: Bearer <API_KEY>  (or however you prefer to auth)

Response:
{
  "leagueId": "soatc-2025-01",
  "leagueName": "January 2025 Monthly League",
  "participants": [
    { "discordId": "123456789012345678", "displayName": "PlayerOne" },
    { "discordId": "987654321098765432", "displayName": "PlayerTwo" }
  ]
}
```

**Questions:**

- What URL will this be at?
- What authentication do you want? (API key, none, OAuth?)
- How often does the participant list change? (We'll cache it)

### 2. Shared Secret

We'll sign all result objects with HMAC-SHA256 so you can verify they came from us.

**Action needed:** Let's exchange a shared secret (generate with `openssl rand -base64 32`)

### 3. Result Submission Method (Phase 1)

For the MVP, players will copy/paste the result JSON. Where should they submit it?

- Discord bot command? (e.g., `/submit-result <paste JSON>`)
- Web form on your site?
- Something else?

---

## What We Provide

### League Match Result Object

After a league match ends, both players see this JSON object with a "Copy" button:

```json
{
  "matchId": "cm4abc123def456ghi789",
  "leagueId": "soatc-2025-01",
  "player1": {
    "discordId": "760593198501330964",
    "displayName": "KingArthur",
    "odentifier": "clxyz789abc123"
  },
  "player2": {
    "discordId": "123456789012345678",
    "displayName": "Merlin",
    "odentifier": "clxyz790def456"
  },
  "winnerId": "760593198501330964",
  "loserId": "123456789012345678",
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

| Field                | Type           | Description                                                   |
| -------------------- | -------------- | ------------------------------------------------------------- |
| `matchId`            | string         | Unique Realms.cards match identifier                          |
| `leagueId`           | string         | League identifier (e.g., "soatc-2025-01")                     |
| `player1`, `player2` | object         | Player info with Discord ID, display name, and Realms user ID |
| `winnerId`           | string \| null | Discord ID of winner (null if draw)                           |
| `loserId`            | string \| null | Discord ID of loser (null if draw)                            |
| `isDraw`             | boolean        | True if match ended in a draw                                 |
| `format`             | string         | "constructed", "sealed", or "draft"                           |
| `startedAt`          | string         | ISO 8601 timestamp when match started                         |
| `completedAt`        | string         | ISO 8601 timestamp when match ended                           |
| `durationSeconds`    | number         | Match duration in seconds                                     |
| `replayId`           | string \| null | Replay identifier (if available)                              |
| `replayUrl`          | string \| null | Direct link to watch the replay                               |
| `timestamp`          | string         | When this result object was generated                         |
| `signature`          | string         | HMAC-SHA256 signature for verification                        |

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
