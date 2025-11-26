# Tasks: Collection Tracker

**Branch**: `010-collection-tracker-track`  
**Input**: Design documents from `/specs/010-collection-tracker-track/`  
**Generated**: 2025-11-26

---

## Phase 1: Database & Setup ✅

- [x] **T001** Add `CollectionCard` model to `prisma/schema.prisma` with fields: id, userId, cardId, setId, variantId, finish, quantity, createdAt, updatedAt. Add unique constraint `[userId, cardId, variantId, finish]` and indexes `[userId]`, `[cardId]`, `[userId, setId]`.

- [x] **T002** Add relation `collectionCards CollectionCard[]` to existing `User` model in `prisma/schema.prisma`.

- [x] **T003** Add relation `collectionCards CollectionCard[]` to existing `Card` model in `prisma/schema.prisma`.

- [x] **T004** Add relation `collectionCards CollectionCard[] @relation("CollectionCardSet")` to existing `Set` model in `prisma/schema.prisma`.

- [x] **T005** Add relation `collectionCards CollectionCard[] @relation("CollectionCardVariant")` to existing `Variant` model in `prisma/schema.prisma`.

- [x] **T006** Run `npm run prisma:generate` and create migration with `npm run prisma:migrate` for CollectionCard table.

- [x] **T007** [P] Create `src/lib/collection/types.ts` with TypeScript types: `CollectionCardInput`, `CollectionCardResponse`, `CollectionStats`, `CardAvailability`, `PriceData`, `PriceProvider` interface.

- [x] **T008** [P] Create `src/lib/collection/validation.ts` with validation functions: `validateQuantity(1-99)`, `validateCardExists`, `validateOwnership`, `validateDeckRules`.

---

## Phase 2: API Implementation ✅

### Collection CRUD

- [x] **T009** Create `src/app/api/collection/route.ts` with GET handler - list user's collection with pagination, filters (setId, element, type, rarity, search), sorting, include card/variant/set relations.

- [x] **T010** Add POST handler to `src/app/api/collection/route.ts` - add cards to collection, handle batch adds, upsert existing entries.

- [x] **T011** Create `src/app/api/collection/[id]/route.ts` with PATCH handler - update quantity, delete entry when quantity <= 0.

- [x] **T012** Add DELETE handler to `src/app/api/collection/[id]/route.ts` - remove card from collection entirely.

### Collection Stats & Missing

- [x] **T013** Create `src/app/api/collection/stats/route.ts` - compute and return totalCards, uniqueCards, totalValue, bySet completion, byElement, byRarity breakdown.

- [x] **T014** Create `src/app/api/collection/missing/route.ts` - return cards not in user's collection, support setId and rarity filters, pagination.

### Import/Export

- [x] **T015** Create `src/app/api/collection/import/route.ts` - parse text format (reuse sorcery-decktext parser), match cards by name, batch upsert to collection.

- [x] **T016** Create `src/app/api/collection/export/route.ts` - export collection as CSV, JSON, or text format with optional setId filter.

### Collection Decks

- [x] **T017** Create `src/app/api/collection/decks/route.ts` with GET handler - list user's collection decks (format=CollectionConstructed).

- [x] **T018** Add POST handler to `src/app/api/collection/decks/route.ts` - create new collection deck with format flag.

- [x] **T019** Create `src/app/api/collection/decks/[id]/route.ts` with GET handler - return deck with card availability info (owned vs inDeck).

- [x] **T020** Add PUT handler to `src/app/api/collection/decks/[id]/route.ts` - update deck, validate ownership for each card, reject if exceeds owned.

- [x] **T021** Add DELETE handler to `src/app/api/collection/decks/[id]/route.ts` - delete collection deck.

- [x] **T022** Create `src/app/api/collection/decks/[id]/export/route.ts` POST handler - copy deck to regular Deck table for simulator use.

- [x] **T023** Create `src/app/api/collection/decks/[id]/availability/route.ts` GET handler - real-time availability check for deck cards.

### Pricing API

- [x] **T024** [P] Create `src/lib/collection/pricing-provider.ts` with `TCGPlayerAffiliateProvider` class implementing `PriceProvider` interface - generate affiliate links.

- [x] **T025** Create `src/app/api/pricing/card/[cardId]/route.ts` - return pricing data and affiliate links for card variants.

- [x] **T026** Create `src/app/api/pricing/bulk/route.ts` POST handler - batch pricing lookup with Redis caching.

- [x] **T027** Create `src/app/api/pricing/affiliate-link/route.ts` - generate TCGPlayer affiliate URL for card name.

---

## Phase 3: UI Components ✅

### Collection Page Layout

- [x] **T028** Create `src/app/collection/layout.tsx` - collection page layout with header, navigation tabs (Collection, Browser, Decks, Stats).

- [x] **T029** Create `src/app/collection/page.tsx` - main collection page showing CollectionGrid, CollectionStats sidebar, empty state for new users.

### Collection Grid

- [x] **T030** Create `src/app/collection/CollectionGrid.tsx` - display owned cards in grid with card images, quantity badges, foil indicators. Support infinite scroll/pagination.

- [x] **T031** Create `src/app/collection/CollectionCard.tsx` - individual card display component with quantity badge, foil styling, click handler for edit modal.

- [x] **T032** Create `src/app/collection/CollectionFilters.tsx` - filter controls for set, element, type, rarity, search input, sort dropdown.

### Card Browser

- [x] **T033** Create `src/app/collection/CardBrowser.tsx` - browse ALL cards with owned/not-owned status, reuse existing card search API, show "Add to Collection" button.

- [x] **T034** Create `src/app/collection/AddCardModal.tsx` - modal for adding card: quantity spinner, finish selector (Standard/Foil), variant picker.

### Quick Add

- [x] **T035** Create `src/app/collection/QuickAdd.tsx` - streamlined quick-add interface: search-as-you-type, one-click add with defaults, recent cards section, batch mode toggle.

### Collection Stats

- [x] **T036** Create `src/app/collection/CollectionStats.tsx` - display stats: totalCards, uniqueCards, totalValue, set completion bars, element pie chart, rarity breakdown.

- [x] **T037** Create `src/app/collection/MissingCards.tsx` - list cards user doesn't own, grouped by set, with "Add to Wishlist" placeholder for future.

### Collection Deck Builder

- [x] **T038** Create `src/app/collection/decks/page.tsx` - list collection decks with create button, deck cards showing avatar and validation status.

- [x] **T039** Create `src/app/collection/decks/[id]/page.tsx` - collection deck editor: card picker filtered to owned cards, availability indicators, validation warnings.

- [x] **T040** Create `src/app/collection/decks/CollectionDeckEditor.tsx` - deck editing component with ownership enforcement, remaining quantity display, export button.

### Pricing Display

- [x] **T041** Create `src/app/collection/CardPriceTag.tsx` - display card price (or N/A), "Buy on TCGPlayer" affiliate link button.

- [x] **T042** Integrate CardPriceTag into CollectionCard.tsx and CollectionGrid.tsx - show price on hover/detail view.

---

## Phase 4: Integration & Polish ✅

### Navigation Integration

- [x] **T043** Add "Your Collection" link to main page (`src/app/page.tsx`) in the main navigation/feature section.

- [x] **T044** Add collection link to user menu/header for authenticated users.

### Import Integration

- [x] **T045** Create `src/app/collection/ImportCollection.tsx` - text import UI similar to DeckImportText, with preview and confirmation.

### Export Integration

- [x] **T046** Add export buttons to CollectionStats - CSV, JSON, text format downloads.

### Performance & Polish

- [x] **T047** Add loading skeletons to CollectionGrid for better perceived performance.

- [x] **T048** Implement virtual scrolling in CollectionGrid for collections with 500+ cards.

- [x] **T049** Add optimistic updates for quantity changes in collection.

- [x] **T050** Run quickstart.md validation scenarios manually and document results.

---

## Dependencies

```
T001-T005 → T006 (schema before migration)
T006 → T007-T008 (migration before types)
T007-T008 → T009-T027 (types/validation used by API)
T009-T016 → T028-T042 (API before UI)
T017-T023 → T038-T040 (deck API before deck UI)
T024-T027 → T041-T042 (pricing before price display)
T028-T042 → T043-T050 (UI before integration/polish)
```

---

## Parallel Execution Examples

### Database Tasks (T001-T005 sequential, then T006)

```bash
# Run schema updates in sequence (same file)
Task: "T001-T005 Update prisma/schema.prisma"
# Then T006 migration
```

### Types & Validation (T007-T008 parallel)

```bash
# Different files, can run in parallel
Task: "T007 Create src/lib/collection/types.ts"
Task: "T008 Create src/lib/collection/validation.ts"
```

### API Endpoints (mixed parallel/sequential)

```bash
# Different route files can be parallel
Task: "T009 GET /api/collection (src/app/api/collection/route.ts)"
Task: "T013 GET /api/collection/stats (src/app/api/collection/stats/route.ts)"
Task: "T025 GET /api/pricing/card/[cardId] (src/app/api/pricing/card/[cardId]/route.ts)"

# Same file must be sequential
# T009 → T010 (both in collection/route.ts)
# T011 → T012 (both in collection/[id]/route.ts)
```

### UI Components (mostly parallel)

```bash
# Independent components can be parallel
Task: "T030 CollectionGrid.tsx"
Task: "T033 CardBrowser.tsx"
Task: "T035 QuickAdd.tsx"
Task: "T036 CollectionStats.tsx"
```

---

## Estimated Effort

| Phase                   | Tasks        | Effort   |
| ----------------------- | ------------ | -------- |
| 1. Database & Setup     | T001-T008    | ~2h      |
| 2. API Implementation   | T009-T027    | ~6h      |
| 3. UI Components        | T028-T042    | ~8h      |
| 4. Integration & Polish | T043-T050    | ~3h      |
| **Total**               | **50 tasks** | **~19h** |

---
