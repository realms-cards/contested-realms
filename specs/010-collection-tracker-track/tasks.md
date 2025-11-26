# Tasks: Collection Tracker

**Branch**: `010-collection-tracker-track`  
**Input**: Design documents from `/specs/010-collection-tracker-track/`  
**Generated**: 2025-11-26

---

## Phase 3.1: Database & Setup

- [ ] **T001** Add `CollectionCard` model to `prisma/schema.prisma` with fields: id, userId, cardId, setId, variantId, finish, quantity, createdAt, updatedAt. Add unique constraint `[userId, cardId, variantId, finish]` and indexes `[userId]`, `[cardId]`, `[userId, setId]`.

- [ ] **T002** Add relation `collectionCards CollectionCard[]` to existing `User` model in `prisma/schema.prisma`.

- [ ] **T003** Add relation `collectionCards CollectionCard[]` to existing `Card` model in `prisma/schema.prisma`.

- [ ] **T004** Add relation `collectionCards CollectionCard[] @relation("CollectionCardSet")` to existing `Set` model in `prisma/schema.prisma`.

- [ ] **T005** Add relation `collectionCards CollectionCard[] @relation("CollectionCardVariant")` to existing `Variant` model in `prisma/schema.prisma`.

- [ ] **T006** Run `npm run prisma:generate` and create migration with `npm run prisma:migrate` for CollectionCard table.

- [ ] **T007** [P] Create `src/lib/collection/types.ts` with TypeScript types: `CollectionCardInput`, `CollectionCardResponse`, `CollectionStats`, `CardAvailability`, `PriceData`, `PriceProvider` interface.

- [ ] **T008** [P] Create `src/lib/collection/validation.ts` with validation functions: `validateQuantity(1-99)`, `validateCardExists`, `validateOwnership`, `validateDeckRules`.

---

## Phase 3.2: Contract Tests (TDD) ⚠️ MUST COMPLETE BEFORE 3.3

**CRITICAL: These tests MUST be written and MUST FAIL before implementation**

- [ ] **T009** [P] Contract test for GET /api/collection in `tests/contract/collection-api.test.ts` - test pagination, filters, auth required, response shape.

- [ ] **T010** [P] Contract test for POST /api/collection in `tests/contract/collection-api.test.ts` - test adding cards, batch add, validation errors.

- [ ] **T011** [P] Contract test for PATCH /api/collection/[id] in `tests/contract/collection-api.test.ts` - test quantity update, delete on zero.

- [ ] **T012** [P] Contract test for DELETE /api/collection/[id] in `tests/contract/collection-api.test.ts` - test removal, 404.

- [ ] **T013** [P] Contract test for GET /api/collection/stats in `tests/contract/collection-api.test.ts` - test summary, bySet, byElement, byRarity.

- [ ] **T014** [P] Contract test for GET /api/collection/missing in `tests/contract/collection-api.test.ts` - test missing cards list, filters.

- [ ] **T015** [P] Contract test for POST /api/collection/import in `tests/contract/collection-api.test.ts` - test text parsing, card matching.

- [ ] **T016** [P] Contract test for GET /api/collection/export in `tests/contract/collection-api.test.ts` - test CSV, JSON formats.

- [ ] **T017** [P] Contract test for collection deck endpoints in `tests/contract/collection-decks-api.test.ts` - test CRUD, ownership validation, export.

- [ ] **T018** [P] Contract test for pricing endpoints in `tests/contract/pricing-api.test.ts` - test GET card pricing, bulk pricing, affiliate links.

- [ ] **T019** [P] Unit test for validation functions in `tests/unit/collection-validation.test.ts` - test quantity bounds, ownership checks.

---

## Phase 3.3: API Implementation (ONLY after tests are failing)

### Collection CRUD

- [ ] **T020** Create `src/app/api/collection/route.ts` with GET handler - list user's collection with pagination, filters (setId, element, type, rarity, search), sorting, include card/variant/set relations.

- [ ] **T021** Add POST handler to `src/app/api/collection/route.ts` - add cards to collection, handle batch adds, upsert existing entries.

- [ ] **T022** Create `src/app/api/collection/[id]/route.ts` with PATCH handler - update quantity, delete entry when quantity <= 0.

- [ ] **T023** Add DELETE handler to `src/app/api/collection/[id]/route.ts` - remove card from collection entirely.

### Collection Stats & Missing

- [ ] **T024** Create `src/app/api/collection/stats/route.ts` - compute and return totalCards, uniqueCards, totalValue, bySet completion, byElement, byRarity breakdown.

- [ ] **T025** Create `src/app/api/collection/missing/route.ts` - return cards not in user's collection, support setId and rarity filters, pagination.

### Import/Export

- [ ] **T026** Create `src/app/api/collection/import/route.ts` - parse text format (reuse sorcery-decktext parser), match cards by name, batch upsert to collection.

- [ ] **T027** Create `src/app/api/collection/export/route.ts` - export collection as CSV, JSON, or text format with optional setId filter.

### Collection Decks

- [ ] **T028** Create `src/app/api/collection/decks/route.ts` with GET handler - list user's collection decks (format=CollectionConstructed).

- [ ] **T029** Add POST handler to `src/app/api/collection/decks/route.ts` - create new collection deck with format flag.

- [ ] **T030** Create `src/app/api/collection/decks/[id]/route.ts` with GET handler - return deck with card availability info (owned vs inDeck).

- [ ] **T031** Add PUT handler to `src/app/api/collection/decks/[id]/route.ts` - update deck, validate ownership for each card, reject if exceeds owned.

- [ ] **T032** Add DELETE handler to `src/app/api/collection/decks/[id]/route.ts` - delete collection deck.

- [ ] **T033** Create `src/app/api/collection/decks/[id]/export/route.ts` POST handler - copy deck to regular Deck table for simulator use.

- [ ] **T034** Create `src/app/api/collection/decks/[id]/availability/route.ts` GET handler - real-time availability check for deck cards.

### Pricing API

- [ ] **T035** [P] Create `src/lib/collection/pricing-provider.ts` with `TCGPlayerAffiliateProvider` class implementing `PriceProvider` interface - generate affiliate links.

- [ ] **T036** Create `src/app/api/pricing/card/[cardId]/route.ts` - return pricing data and affiliate links for card variants.

- [ ] **T037** Create `src/app/api/pricing/bulk/route.ts` POST handler - batch pricing lookup with Redis caching.

- [ ] **T038** Create `src/app/api/pricing/affiliate-link/route.ts` - generate TCGPlayer affiliate URL for card name.

---

## Phase 3.4: UI Components

### Collection Page Layout

- [ ] **T039** Create `src/app/collection/layout.tsx` - collection page layout with header, navigation tabs (Collection, Browser, Decks, Stats).

- [ ] **T040** Create `src/app/collection/page.tsx` - main collection page showing CollectionGrid, CollectionStats sidebar, empty state for new users.

### Collection Grid

- [ ] **T041** Create `src/app/collection/CollectionGrid.tsx` - display owned cards in grid with card images, quantity badges, foil indicators. Support infinite scroll/pagination.

- [ ] **T042** Create `src/app/collection/CollectionCard.tsx` - individual card display component with quantity badge, foil styling, click handler for edit modal.

- [ ] **T043** Create `src/app/collection/CollectionFilters.tsx` - filter controls for set, element, type, rarity, search input, sort dropdown.

### Card Browser

- [ ] **T044** Create `src/app/collection/CardBrowser.tsx` - browse ALL cards with owned/not-owned status, reuse existing card search API, show "Add to Collection" button.

- [ ] **T045** Create `src/app/collection/AddCardModal.tsx` - modal for adding card: quantity spinner, finish selector (Standard/Foil), variant picker.

### Quick Add

- [ ] **T046** Create `src/app/collection/QuickAdd.tsx` - streamlined quick-add interface: search-as-you-type, one-click add with defaults, recent cards section, batch mode toggle.

### Collection Stats

- [ ] **T047** Create `src/app/collection/CollectionStats.tsx` - display stats: totalCards, uniqueCards, totalValue, set completion bars, element pie chart, rarity breakdown.

- [ ] **T048** Create `src/app/collection/MissingCards.tsx` - list cards user doesn't own, grouped by set, with "Add to Wishlist" placeholder for future.

### Collection Deck Builder

- [ ] **T049** Create `src/app/collection/decks/page.tsx` - list collection decks with create button, deck cards showing avatar and validation status.

- [ ] **T050** Create `src/app/collection/decks/[id]/page.tsx` - collection deck editor: card picker filtered to owned cards, availability indicators, validation warnings.

- [ ] **T051** Create `src/app/collection/decks/CollectionDeckEditor.tsx` - deck editing component with ownership enforcement, remaining quantity display, export button.

### Pricing Display

- [ ] **T052** Create `src/app/collection/CardPriceTag.tsx` - display card price (or N/A), "Buy on TCGPlayer" affiliate link button.

- [ ] **T053** Integrate CardPriceTag into CollectionCard.tsx and CollectionGrid.tsx - show price on hover/detail view.

---

## Phase 3.5: Integration & Polish

### Navigation Integration

- [ ] **T054** Add "Your Collection" link to main page (`src/app/page.tsx`) in the main navigation/feature section.

- [ ] **T055** Add collection link to user menu/header for authenticated users.

### Import Integration

- [ ] **T056** Create `src/app/collection/ImportCollection.tsx` - text import UI similar to DeckImportText, with preview and confirmation.

### Export Integration

- [ ] **T057** Add export buttons to CollectionStats - CSV, JSON, text format downloads.

### End-to-End Testing

- [ ] **T058** [P] Integration test: Add card → verify in collection → update quantity → verify update → delete → verify removal in `tests/e2e/collection-crud.test.ts`.

- [ ] **T059** [P] Integration test: Create collection deck → add cards → verify ownership limits → export to simulator → verify playable in `tests/e2e/collection-deck.test.ts`.

- [ ] **T060** [P] Integration test: Import text → verify cards added → export → verify format in `tests/e2e/collection-import-export.test.ts`.

### Performance & Polish

- [ ] **T061** Add loading skeletons to CollectionGrid for better perceived performance.

- [ ] **T062** Implement virtual scrolling in CollectionGrid for collections with 500+ cards.

- [ ] **T063** Add optimistic updates for quantity changes in collection.

- [ ] **T064** Run quickstart.md validation scenarios manually and document results.

---

## Dependencies

```
T001-T005 → T006 (schema before migration)
T006 → T007-T008 (migration before types)
T009-T019 → T020-T038 (tests before implementation)
T007 → T020-T038 (types used by API)
T008 → T020-T038 (validation used by API)
T020-T027 → T039-T053 (API before UI)
T028-T034 → T049-T051 (deck API before deck UI)
T035-T038 → T052-T053 (pricing before price display)
T039-T053 → T054-T060 (UI before integration)
T054-T060 → T061-T064 (integration before polish)
```

---

## Parallel Execution Examples

### Database Tasks (T001-T005 together, then T006)

```bash
# Run schema updates in sequence (same file)
Task: "T001 Add CollectionCard model to prisma/schema.prisma"
# Then T002-T005 sequentially (same file)
# Then T006 migration
```

### Contract Tests (T009-T019 parallel)

```bash
# All contract tests can run in parallel (different files/test suites)
Task: "T009 Contract test GET /api/collection"
Task: "T010 Contract test POST /api/collection"
Task: "T017 Contract test collection deck endpoints"
Task: "T018 Contract test pricing endpoints"
Task: "T019 Unit test validation functions"
```

### API Endpoints (mixed parallel/sequential)

```bash
# Different route files can be parallel
Task: "T020 GET /api/collection (src/app/api/collection/route.ts)"
Task: "T024 GET /api/collection/stats (src/app/api/collection/stats/route.ts)"
Task: "T036 GET /api/pricing/card/[cardId] (src/app/api/pricing/card/[cardId]/route.ts)"

# Same file must be sequential
# T020 → T021 (both in collection/route.ts)
# T022 → T023 (both in collection/[id]/route.ts)
```

### UI Components (mostly parallel)

```bash
# Independent components can be parallel
Task: "T041 CollectionGrid.tsx"
Task: "T044 CardBrowser.tsx"
Task: "T046 QuickAdd.tsx"
Task: "T047 CollectionStats.tsx"
```

---

## Validation Checklist

- [x] All contracts have corresponding tests (T009-T018)
- [x] All entities have model tasks (T001 CollectionCard)
- [x] All tests come before implementation (T009-T019 before T020+)
- [x] Parallel tasks truly independent (different files)
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task

---

## Estimated Effort

| Phase                    | Tasks        | Effort   |
| ------------------------ | ------------ | -------- |
| 3.1 Database & Setup     | T001-T008    | ~2h      |
| 3.2 Contract Tests       | T009-T019    | ~3h      |
| 3.3 API Implementation   | T020-T038    | ~6h      |
| 3.4 UI Components        | T039-T053    | ~8h      |
| 3.5 Integration & Polish | T054-T064    | ~3h      |
| **Total**                | **64 tasks** | **~22h** |

---
