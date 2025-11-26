# API Contract: Collection Deck Building

**Base Path**: `/api/collection/decks`  
**Auth**: Required (NextAuth session)

---

## Overview

Collection decks are built from owned cards with quantity constraints.
They live in the same Deck table but are flagged and validated differently.

---

## Endpoints

### GET /api/collection/decks

List user's collection-based decks.

**Response 200**:

```json
{
  "decks": [
    {
      "id": "deck_123",
      "name": "My Fire Deck",
      "format": "Constructed",
      "isCollectionDeck": true,
      "cardCount": 52,
      "isValid": true,
      "validationErrors": [],
      "avatarCard": {
        "name": "Pyromancer",
        "slug": "pyromancer_b_s"
      },
      "updatedAt": "2025-11-26T22:00:00Z"
    }
  ]
}
```

---

### POST /api/collection/decks

Create a new collection-based deck.

**Request Body**:

```json
{
  "name": "My Fire Deck"
}
```

**Response 201**:

```json
{
  "id": "deck_123",
  "name": "My Fire Deck",
  "format": "CollectionConstructed",
  "isCollectionDeck": true,
  "cards": [],
  "createdAt": "2025-11-26T22:00:00Z"
}
```

---

### GET /api/collection/decks/[id]

Get a collection deck with availability info.

**Response 200**:

```json
{
  "id": "deck_123",
  "name": "My Fire Deck",
  "format": "CollectionConstructed",
  "isCollectionDeck": true,
  "cards": [
    {
      "cardId": 456,
      "variantId": 789,
      "name": "Apprentice Wizard",
      "zone": "Spellbook",
      "count": 4,
      "ownedQuantity": 4,
      "availableQuantity": 0
    }
  ],
  "validation": {
    "isValid": true,
    "errors": [],
    "warnings": []
  },
  "stats": {
    "spellbookCount": 40,
    "atlasCount": 12,
    "sideboardCount": 0,
    "hasAvatar": true
  }
}
```

---

### PUT /api/collection/decks/[id]

Update a collection deck (add/remove cards).

**Request Body**:

```json
{
  "name": "My Fire Deck v2",
  "cards": [
    {
      "cardId": 456,
      "variantId": 789,
      "zone": "Spellbook",
      "count": 4
    }
  ]
}
```

**Validation**: Server validates each card against collection ownership.

**Response 200** (success):

```json
{
  "id": "deck_123",
  "name": "My Fire Deck v2",
  "cards": [...],
  "validation": {
    "isValid": true,
    "errors": [],
    "warnings": []
  }
}
```

**Response 400** (ownership violation):

```json
{
  "error": "Card quantity exceeds collection",
  "code": "EXCEEDS_OWNED",
  "details": {
    "cardId": 456,
    "requested": 4,
    "owned": 2
  }
}
```

---

### DELETE /api/collection/decks/[id]

Delete a collection deck.

**Response 200**:

```json
{
  "deleted": true,
  "id": "deck_123"
}
```

---

### POST /api/collection/decks/[id]/export

Export collection deck to main deck list (simulator).

**Request Body**:

```json
{
  "name": "My Fire Deck (exported)"
}
```

**Response 201**:

```json
{
  "exportedDeckId": "deck_456",
  "name": "My Fire Deck (exported)",
  "format": "Constructed",
  "cardCount": 52,
  "message": "Deck exported successfully. Use it in any game mode."
}
```

This creates a regular Deck copy that can be used in online/offline matches.

---

### GET /api/collection/decks/[id]/availability

Check card availability for a deck (real-time validation).

**Response 200**:

```json
{
  "deckId": "deck_123",
  "cards": [
    {
      "cardId": 456,
      "name": "Apprentice Wizard",
      "inDeck": 4,
      "owned": 4,
      "available": 0,
      "status": "full"
    },
    {
      "cardId": 789,
      "name": "Dragon Lord",
      "inDeck": 2,
      "owned": 1,
      "available": -1,
      "status": "exceeded"
    }
  ],
  "isValid": false,
  "errors": ["Dragon Lord: need 2, own 1"]
}
```

---

## Validation Rules

### Collection Deck Requirements

| Rule          | Error Code      | Description                          |
| ------------- | --------------- | ------------------------------------ |
| Ownership     | EXCEEDS_OWNED   | Can't add more than owned quantity   |
| Avatar        | MISSING_AVATAR  | Must have exactly 1 avatar           |
| Spellbook Min | SPELLBOOK_MIN   | At least 40 cards in spellbook       |
| Atlas Min     | ATLAS_MIN       | At least 12 sites in atlas           |
| No Duplicates | DUPLICATE_ENTRY | Same card can't appear twice in deck |

### Availability Status

| Status      | Description                              |
| ----------- | ---------------------------------------- |
| available   | Can add more (owned > inDeck)            |
| full        | Using all owned copies (owned == inDeck) |
| exceeded    | Using more than owned (error state)      |
| unavailable | Don't own this card                      |

---

## Type Definitions

```typescript
interface CollectionDeckCard {
  cardId: number;
  variantId: number | null;
  setId: number | null;
  zone: "Spellbook" | "Atlas" | "Sideboard";
  count: number;
}

interface CollectionDeckValidation {
  isValid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

interface ValidationError {
  code: string;
  message: string;
  cardId?: number;
  cardName?: string;
}

interface CardAvailability {
  cardId: number;
  name: string;
  inDeck: number;
  owned: number;
  available: number;
  status: "available" | "full" | "exceeded" | "unavailable";
}
```

---
