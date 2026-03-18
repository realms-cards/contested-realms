# Realms.cards Deck Import API — Integration Guide

## Overview

Realms.cards provides a deep-link import flow that lets your users export decks directly into their realms.cards account. The flow works like this:

1. Your app builds a URL containing the deck data
2. User is redirected to realms.cards
3. If not signed in, they sign in (deck data is preserved in the URL)
4. The deck is created and the user lands in the deck editor to refine it

No API keys, CORS configuration, or server-side integration needed.

## URL Format

```
https://realms.cards/decks/import/external?list=<base64url>&name=<deckName>&source=<yourApp>
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `list`    | Yes      | Base64url-encoded card list (see format below) |
| `name`    | No       | Deck name (URL-encoded) |
| `source`  | No       | Your app identifier, e.g. `realmdraft` — shown in the import UI |

## Card List Format

Plain text, one card per line: `<count> <card name>`

```
1 Druid
2 Baptize
1 Barrow Wight
1 Bone Spear
1 Bound Spirit
1 Drowned
1 Forsaken
1 Ghostfire
1 Gift of the Frog
1 Gift of the Raven
1 Ignited
1 Leadworks
3 Aqueduct
2 Autumn River
3 Blessed Well
```

- **No section headers needed** — realms.cards auto-detects card types (Avatar, Site, Spell) from its database and assigns them to the correct zones
- Card names are matched case-insensitively with fuzzy matching (handles minor typos, curly quotes, etc.)
- Unresolved cards are reported as warnings but don't block the import — the user can fix them in the editor

## Encoding

Use [base64url](https://datatracker.ietf.org/doc/html/rfc4648#section-5) encoding (URL-safe base64):
- Standard base64, then replace `+` with `-`, `/` with `_`, strip trailing `=` padding

## Integration Code

```javascript
function exportToRealmsCards(deckName, cardList) {
  // cardList: "1 Druid\n2 Baptize\n3 Aqueduct\n..."
  const encoded = btoa(cardList)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const url = new URL('https://realms.cards/decks/import/external');
  url.searchParams.set('list', encoded);
  if (deckName) url.searchParams.set('name', deckName);
  url.searchParams.set('source', 'realmdraft');

  window.open(url.toString(), '_blank');
}
```

## What Happens on the Realms.cards Side

1. **Not signed in** — User sees the card list preview + a sign-in prompt. After signing in, the import proceeds automatically (URL params are preserved).
2. **Signed in** — Import starts immediately. Cards are resolved against the database, zones are auto-assigned, and the deck is created.
3. **After import** — User is redirected to the 3D deck editor where they can:
   - Move cards between zones (Spellbook, Atlas, Collection)
   - Add/remove cards
   - Set their avatar
   - Save when ready

## Format Detection

The deck format is auto-detected based on total card count:
- **≤ 55 cards** → Sealed (limited) format
- **> 55 cards** → Constructed format

## Response Behavior

| Scenario | User sees |
|----------|-----------|
| All cards resolved | Instant redirect to deck editor |
| Some cards fuzzy-matched | Success with warnings (e.g. "Baptise" → "Baptize") |
| Some cards unresolved | Success — resolved cards are imported, unresolved shown as warnings |
| All cards unresolved | Error message with list of unresolved card names |
| Invalid base64 | Decode error message |

## Size Limits

- Max decoded card list: **10 KB** (~300+ cards, well beyond any deck size)
- URL length: a typical 91-card constructed deck encodes to ~1.5–2 KB, well within browser limits

## Example

A sealed pool with 12 cards (abbreviated):
```
1 Druid
2 Baptize
1 Barrow Wight
1 Bone Spear
1 Bound Spirit
1 Drowned
1 Forsaken
1 Ghostfire
1 Gift of the Frog
1 Gift of the Raven
1 Ignited
1 Leadworks
```

Encoded URL:
```
https://realms.cards/decks/import/external?list=MSBEcnVpZAoyIEJhcHRpemUKMSBCYXJyb3cgV2lnaHQKMSBCb25lIFNwZWFyCjEgQm91bmQgU3Bpcml0CjEgRHJvd25lZAoxIEZvcnNha2VuCjEgR2hvc3RmaXJlCjEgR2lmdCBvZiB0aGUgRnJvZwoxIEdpZnQgb2YgdGhlIFJhdmVuCjEgSWduaXRlZAoxIExlYWR3b3Jrcw&name=My%20Sealed%20Pool&source=realmdraft
```
