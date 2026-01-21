# Card Metadata Enrichment Implementation

## Overview

Enhanced `CardRef` objects to include full card metadata (text, attack, defence, rarity) at deck load time, eliminating the need for async `fetchCardMeta()` calls in resolvers.

## Benefits

1. **No async fetches in resolvers** - All data available synchronously
2. **Simpler resolver code** - Direct property access instead of metadata lookups
3. **Better performance** - No network requests during game actions
4. **Service worker cache integration** - Leverages existing offline cache
5. **More reliable** - No race conditions or missing metadata

## Changes Made

### 1. Type Definition (`src/lib/game/store/types.ts`)

Extended `CardRef` type to include:

- `text?: string | null` - Full card text
- `attack?: number | null` - Base attack value
- `defence?: number | null` - Base defence value
- `rarity?: string | null` - Card rarity (Ordinary, Exceptional, Elite, Unique)

### 2. Metadata Loader (`src/lib/game/cardMetadataLoader.ts`)

New utility module with:

- `fetchCardMetadata(cardIds)` - Fetches from service worker cache first, falls back to API
- `enrichCardRef(card, metadata)` - Enriches a single CardRef with metadata
- `enrichCardRefs(cards)` - Batch enriches an array of CardRef objects

**Cache Strategy:**

1. Try service worker cache (`realms-cards-v1`) first
2. Fetch missing cards from `/api/cards/meta` API
3. Cache API responses for future use

### 3. Deck Loader (`src/lib/game/deckLoader.ts`)

Updated all deck loading functions to enrich cards:

- `loadDeckFor()` - Enriches spellbook, atlas, and collection
- `loadSealedDeckFor()` - Enriches all cards including spawned collection cards
- `loadTournamentConstructedDeck()` - Enriches spellbook and atlas

**Enrichment happens after API fetch, before deck validation:**

```typescript
[rawSpellbook, rawAtlas, rawCollection] = await Promise.all([
  enrichCardRefs(rawSpellbook),
  enrichCardRefs(rawAtlas),
  enrichCardRefs(rawCollection),
]);
```

### 4. Simplified Resolvers

Removed `fetchCardMeta()` calls and `metaByCardId` lookups from:

#### `accusationState.ts`

- Now uses `card.subTypes` directly instead of `metaByCardId[card.cardId]?.subTypes`
- Simplified Evil subtype checking for both hand and board

#### `blackMassState.ts`

- Removed async `fetchCardMeta()` call
- Uses `card.type` and `card.subTypes` directly

#### `searingTruthState.ts`

- Uses `card.cost` directly instead of metadata lookup
- Removed unused `cardIds` variable

#### `doomsdayCultState.ts`

- Uses `card.subTypes` directly for Evil checking

#### `highlandPrincessState.ts`

- Removed async `fetchCardMeta()` call
- Uses `card.type` and `card.cost` directly for artifact filtering

#### `assortedAnimalsState.ts`

- Removed async `fetchCardMeta()` call
- Uses `card.subTypes` and `card.cost` directly for Beast filtering

#### `demonicContractState.ts`

- Uses `card.subTypes` directly for Demon checking
- Uses `card.rarity` directly for rarity filtering (2 locations)
- Removed all async metadata fetches

## Migration Notes

### For Existing Resolvers

Old pattern:

```typescript
const metaByCardId = get().metaByCardId;
const meta = metaByCardId[card.cardId];
const cost = meta?.cost ?? 0;
```

New pattern:

```typescript
const cost = card.cost ?? 0;
```

### For New Resolvers

Simply access properties directly from `CardRef`:

- `card.text` - Full card text
- `card.attack` - Base attack
- `card.defence` - Base defence
- `card.rarity` - Card rarity
- `card.type` - Card type
- `card.subTypes` - Card subtypes
- `card.cost` - Mana cost

## Testing Recommendations

1. **Deck Loading** - Verify all three deck loaders enrich cards correctly
2. **Resolver Functionality** - Test each simplified resolver:
   - Accusation (Evil detection)
   - Black Mass (Evil minion filtering)
   - Searing Truth (cost comparison)
   - Doomsday Cult (Evil top card)
   - Highland Princess (artifact ≤1 cost)
   - Assorted Animals (Beast filtering)
   - Demonic Contract (Demon rarity, card filtering)
3. **Service Worker Cache** - Verify cache-first strategy works
4. **Offline Play** - Test that enriched cards work without network

## Future Work

Other resolvers that could be simplified:

- `customMessageHandlers.ts` - Lilith's combat damage calculation
- Any other resolvers still using `metaByCardId` lookups

## Performance Impact

**Before:**

- Each resolver made async API calls to fetch metadata
- Multiple network requests during game actions
- Race conditions possible with concurrent fetches

**After:**

- All metadata loaded once at deck load time
- Zero network requests during game actions
- Synchronous property access in resolvers
- Service worker cache reduces initial load time
