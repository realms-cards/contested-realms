# Data Model: Collection Tracker

**Feature**: Collection Tracker  
**Branch**: `010-collection-tracker-track`  
**Date**: 2025-11-26

---

## Entities

### CollectionCard

Represents a user's ownership of a specific card variant with a specific finish.

| Field     | Type     | Constraints               | Description               |
| --------- | -------- | ------------------------- | ------------------------- |
| id        | Int      | PK, autoincrement         | Unique identifier         |
| userId    | String   | FK → User.id, required    | Owner of the card         |
| cardId    | Int      | FK → Card.id, required    | Base card reference       |
| setId     | Int?     | FK → Set.id, optional     | Set the card is from      |
| variantId | Int?     | FK → Variant.id, optional | Specific printing/variant |
| finish    | Finish   | enum, required            | Standard or Foil          |
| quantity  | Int      | 1-99, default 1           | Number of copies owned    |
| createdAt | DateTime | auto                      | When first added          |
| updatedAt | DateTime | auto                      | Last modification         |

**Unique Constraint**: `[userId, cardId, variantId, finish]`

**Indexes**:

- `[userId]` - user's collection queries
- `[cardId]` - card lookup
- `[userId, setId]` - set completion queries

### PriceCache (Optional - Redis)

Cached pricing data for cards. Not a Prisma model - stored in Redis.

| Field       | Type   | Description                           |
| ----------- | ------ | ------------------------------------- |
| key         | String | `price:{cardId}:{variantId}:{finish}` |
| marketPrice | Float? | Current market price                  |
| lowPrice    | Float? | Low end price                         |
| midPrice    | Float? | Mid market price                      |
| highPrice   | Float? | High end price                        |
| currency    | String | USD, EUR                              |
| source      | String | Provider name                         |
| updatedAt   | Int    | Unix timestamp                        |
| ttl         | Int    | 3600 seconds (1 hour)                 |

---

## Relationships

```
User
├── CollectionCard[] (one-to-many)

CollectionCard
├── User (many-to-one)
├── Card (many-to-one)
├── Set? (many-to-one)
├── Variant? (many-to-one)

Card (existing)
├── CollectionCard[] (one-to-many, new relation)

Variant (existing)
├── CollectionCard[] (one-to-many, new relation)

Set (existing)
├── CollectionCard[] (one-to-many, new relation)
```

---

## Prisma Schema Addition

```prisma
model CollectionCard {
  id        Int      @id @default(autoincrement())
  userId    String
  cardId    Int
  setId     Int?
  variantId Int?
  finish    Finish   @default(Standard)
  quantity  Int      @default(1)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  card    Card     @relation(fields: [cardId], references: [id], onDelete: Cascade)
  set     Set?     @relation("CollectionCardSet", fields: [setId], references: [id])
  variant Variant? @relation("CollectionCardVariant", fields: [variantId], references: [id])

  @@unique([userId, cardId, variantId, finish])
  @@index([userId])
  @@index([cardId])
  @@index([userId, setId])
}

// Add to existing User model:
// collectionCards CollectionCard[]

// Add to existing Card model:
// collectionCards CollectionCard[]

// Add to existing Set model:
// collectionCards CollectionCard[] @relation("CollectionCardSet")

// Add to existing Variant model:
// collectionCards CollectionCard[] @relation("CollectionCardVariant")
```

---

## Validation Rules

### CollectionCard

| Rule            | Description                                                     |
| --------------- | --------------------------------------------------------------- |
| quantity >= 1   | Minimum 1 copy                                                  |
| quantity <= 99  | Maximum 99 copies                                               |
| userId exists   | Must be authenticated user                                      |
| cardId exists   | Must reference valid card                                       |
| variantId valid | If provided, must match cardId's variants                       |
| setId valid     | If provided, must match card's available sets                   |
| unique combo    | Same user cannot have duplicate (card, variant, finish) entries |

### Business Rules

1. **Zero Quantity**: When quantity reaches 0, delete the CollectionCard entry
2. **Variant Fallback**: If variantId is null, treat as "any variant" for deck building
3. **Finish Separation**: Standard and Foil are tracked separately (user might own both)
4. **Deck Export**: Collection decks copy card data, don't link to CollectionCard

---

## State Transitions

### CollectionCard Lifecycle

```
[Not in collection]
    │
    ▼ addToCollection(cardId, quantity, finish)
    │
[In collection: quantity >= 1]
    │
    ├─▶ updateQuantity(+n) → [quantity increased]
    │
    ├─▶ updateQuantity(-n) where result >= 1 → [quantity decreased]
    │
    └─▶ updateQuantity(-n) where result <= 0 → [deleted from collection]
         │
         ▼
    [Not in collection]
```

---

## Computed Values (Not Stored)

### Collection Statistics

Computed at query time or cached temporarily:

| Stat          | Computation                                        |
| ------------- | -------------------------------------------------- |
| totalCards    | SUM(quantity) for user                             |
| uniqueCards   | COUNT(DISTINCT cardId) for user                    |
| totalValue    | SUM(quantity × marketPrice) - requires price cache |
| setCompletion | owned unique cards / total cards in set            |
| missingCards  | Cards in set not in user's collection              |

### Deck Availability

For collection-based deck building:

| Stat               | Computation                                         |
| ------------------ | --------------------------------------------------- |
| availableQuantity  | SUM(quantity) for card across all variants/finishes |
| usedInDeck         | Quantity already added to current deck              |
| remainingAvailable | availableQuantity - usedInDeck                      |

---

## Migration Notes

1. **New Table**: `CollectionCard` - no data migration needed
2. **Relation Updates**: Add relations to User, Card, Set, Variant models
3. **Indexes**: Create indexes for performance
4. **Backward Compatible**: No changes to existing Deck/DeckCard functionality

---
