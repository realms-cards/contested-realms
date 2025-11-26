# API Contract: Collection Management

**Base Path**: `/api/collection`  
**Auth**: Required (NextAuth session)

---

## Endpoints

### GET /api/collection

Get user's collection with optional filters and pagination.

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 50 | Items per page (max 100) |
| setId | number? | - | Filter by set |
| element | string? | - | Filter by element (Air, Earth, Fire, Water) |
| type | string? | - | Filter by type (Avatar, Site, Minion, etc.) |
| rarity | string? | - | Filter by rarity |
| search | string? | - | Search by card name |
| sort | string | name | Sort: name, quantity, recent, value |
| order | string | asc | Order: asc, desc |

**Response 200**:

```json
{
  "cards": [
    {
      "id": 123,
      "cardId": 456,
      "variantId": 789,
      "setId": 2,
      "finish": "Standard",
      "quantity": 4,
      "card": {
        "name": "Apprentice Wizard",
        "elements": "Air",
        "subTypes": "Human Mage"
      },
      "variant": {
        "slug": "apprentice_wizard_b_s",
        "finish": "Standard",
        "product": "Booster"
      },
      "set": {
        "name": "Beta"
      },
      "meta": {
        "type": "Minion",
        "rarity": "Ordinary",
        "cost": 2,
        "attack": 1,
        "defence": 1
      },
      "price": {
        "marketPrice": 0.5,
        "currency": "USD",
        "source": "tcgplayer"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 234,
    "totalPages": 5
  },
  "stats": {
    "totalCards": 567,
    "uniqueCards": 234,
    "totalValue": 1234.56,
    "currency": "USD"
  }
}
```

**Response 401**: Unauthorized

---

### POST /api/collection

Add card(s) to collection.

**Request Body**:

```json
{
  "cards": [
    {
      "cardId": 456,
      "variantId": 789,
      "setId": 2,
      "finish": "Standard",
      "quantity": 1
    }
  ]
}
```

**Response 201**:

```json
{
  "added": [
    {
      "id": 123,
      "cardId": 456,
      "variantId": 789,
      "quantity": 1,
      "isNew": true
    }
  ],
  "updated": [],
  "errors": []
}
```

**Response 400**: Invalid card data
**Response 401**: Unauthorized

---

### PATCH /api/collection/[id]

Update quantity of a collection entry.

**Request Body**:

```json
{
  "quantity": 3
}
```

**Response 200**:

```json
{
  "id": 123,
  "cardId": 456,
  "quantity": 3,
  "updatedAt": "2025-11-26T22:00:00Z"
}
```

**Response 200 (deleted when quantity=0)**:

```json
{
  "deleted": true,
  "id": 123
}
```

**Response 404**: Entry not found
**Response 401**: Unauthorized

---

### DELETE /api/collection/[id]

Remove card from collection entirely.

**Response 200**:

```json
{
  "deleted": true,
  "id": 123
}
```

**Response 404**: Entry not found
**Response 401**: Unauthorized

---

### GET /api/collection/stats

Get collection statistics and set completion data.

**Response 200**:

```json
{
  "summary": {
    "totalCards": 567,
    "uniqueCards": 234,
    "totalValue": 1234.56,
    "currency": "USD"
  },
  "bySet": [
    {
      "setId": 1,
      "setName": "Alpha",
      "owned": 45,
      "total": 100,
      "completion": 0.45,
      "value": 567.89
    },
    {
      "setId": 2,
      "setName": "Beta",
      "owned": 189,
      "total": 250,
      "completion": 0.756,
      "value": 666.67
    }
  ],
  "byElement": {
    "Air": 89,
    "Earth": 56,
    "Fire": 45,
    "Water": 44
  },
  "byRarity": {
    "Ordinary": 150,
    "Exceptional": 60,
    "Elite": 20,
    "Unique": 4
  }
}
```

---

### GET /api/collection/missing

Get cards user doesn't own (for completion tracking).

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| setId | number? | - | Filter by set |
| rarity | string? | - | Filter by rarity |
| page | number | 1 | Page number |
| limit | number | 50 | Items per page |

**Response 200**:

```json
{
  "cards": [
    {
      "cardId": 789,
      "name": "Dragon Lord",
      "set": "Beta",
      "rarity": "Unique",
      "type": "Minion",
      "price": {
        "marketPrice": 150.0,
        "currency": "USD"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 16,
    "totalPages": 1
  }
}
```

---

### POST /api/collection/import

Bulk import cards from text format.

**Request Body**:

```json
{
  "text": "4 Apprentice Wizard\n2 Polar Bears\n1 Dragon Lord",
  "format": "sorcery"
}
```

**Response 200**:

```json
{
  "imported": 7,
  "added": [
    { "name": "Apprentice Wizard", "quantity": 4, "matched": true },
    { "name": "Polar Bears", "quantity": 2, "matched": true },
    { "name": "Dragon Lord", "quantity": 1, "matched": true }
  ],
  "errors": []
}
```

**Response 400**: Parse error

---

### GET /api/collection/export

Export collection to text format.

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| format | string | csv | Export format: csv, json, text |
| setId | number? | - | Filter by set |

**Response 200** (format=csv):

```
"Quantity","Card Name","Set","Finish","Variant"
"4","Apprentice Wizard","Beta","Standard","apprentice_wizard_b_s"
"2","Polar Bears","Beta","Foil","polar_bears_b_f"
```

---

## Error Responses

All endpoints return standard error format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

| Code             | HTTP | Description                |
| ---------------- | ---- | -------------------------- |
| UNAUTHORIZED     | 401  | Not authenticated          |
| NOT_FOUND        | 404  | Collection entry not found |
| INVALID_CARD     | 400  | Card ID doesn't exist      |
| INVALID_QUANTITY | 400  | Quantity out of range      |
| PARSE_ERROR      | 400  | Import text parsing failed |

---
