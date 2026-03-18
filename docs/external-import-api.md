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

Plain text, one card per line: `<count> <card name>`, with optional **section headers** to separate the main deck from the collection (sideboard).

### Section Headers

Use `Deck` and `Collection` as standalone lines to separate zones:

```
Deck
1 Druid
2 Baptize
1 Barrow Wight
1 Bone Spear
3 Aqueduct
2 Autumn River
3 Blessed Well
Collection
1 Ghostfire
1 Gift of the Frog
1 Gift of the Raven
```

- **`Deck`** — Cards below are auto-assigned zones by type: Avatar and Spells go to Spellbook, Sites go to Atlas
- **`Collection`** — Cards below go to the Collection zone (sideboard), regardless of card type

Section headers are **case-insensitive** and must appear on their own line (no card count prefix).

### Without Section Headers

If no section headers are present, all cards are treated as part of the main deck (auto-assigned by type). This is still supported for backwards compatibility:

```
1 Druid
2 Baptize
1 Barrow Wight
3 Aqueduct
2 Autumn River
```

### Card Name Matching

- Card names are matched case-insensitively with fuzzy matching (handles minor typos, curly quotes, etc.)
- Unresolved cards are reported as warnings but don't block the import — the user can fix them in the editor

## Encoding

Use [base64url](https://datatracker.ietf.org/doc/html/rfc4648#section-5) encoding (URL-safe base64):
- Standard base64, then replace `+` with `-`, `/` with `_`, strip trailing `=` padding

## Integration Code

```javascript
function exportToRealmsCards(deckName, deckCards, collectionCards) {
  // deckCards: ["1 Druid", "2 Baptize", "3 Aqueduct", ...]
  // collectionCards: ["1 Ghostfire", "1 Gift of the Frog", ...] (optional)

  let cardList = 'Deck\n' + deckCards.join('\n');
  if (collectionCards && collectionCards.length > 0) {
    cardList += '\nCollection\n' + collectionCards.join('\n');
  }

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

## Zone Assignment

| Section Header | Card Type | Assigned Zone |
|---------------|-----------|---------------|
| `Deck` (or none) | Avatar | Spellbook |
| `Deck` (or none) | Site | Atlas |
| `Deck` (or none) | Any other | Spellbook |
| `Collection` | Any type | Collection |

## What Happens on the Realms.cards Side

1. **Not signed in** — User sees the card list preview + a sign-in prompt. After signing in, the import proceeds automatically (URL params are preserved).
2. **Signed in** — Import starts immediately. Cards are resolved against the database, zones are assigned per the table above, and the deck is created.
3. **After import** — User is redirected to the 3D deck editor where they can:
   - Move cards between zones (Spellbook, Atlas, Collection)
   - Add/remove cards
   - Set their avatar
   - Save when ready

## Format Detection

The deck format is auto-detected based on total card count:
- **<= 55 cards** → Sealed (limited) format
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
- URL length: a typical 91-card constructed deck encodes to ~1.5-2 KB, well within browser limits

## Example

A sealed deck with 9 main-deck cards and 3 collection cards:
```
Deck
1 Druid
2 Baptize
1 Barrow Wight
1 Bone Spear
3 Aqueduct
2 Autumn River
Collection
1 Ghostfire
1 Gift of the Frog
1 Leadworks
```

Encoded URL:
```
https://realms.cards/decks/import/external?list=RGVjawoxIERydWlkCjIgQmFwdGl6ZQoxIEJhcnJvdyBXaWdodAoxIEJvbmUgU3BlYXIKMyBBcXVlZHVjdAoyIEF1dHVtbiBSaXZlcgpDb2xsZWN0aW9uCjEgR2hvc3RmaXJlCjEgR2lmdCBvZiB0aGUgRnJvZwoxIExlYWR3b3Jrcw&name=My%20Sealed%20Pool&source=realmdraft
```
