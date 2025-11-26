# Research: Collection Tracker

**Date**: 2025-11-26  
**Feature**: Collection Tracker  
**Branch**: `010-collection-tracker-track`

---

## Technical Context Resolution

### Language/Framework

- **Decision**: TypeScript, Next.js 15 App Router, React 19
- **Rationale**: Matches existing codebase; proven patterns for card browser, deck editor
- **Alternatives**: None considered - must align with existing stack

### Storage

- **Decision**: PostgreSQL via Prisma (existing setup)
- **Rationale**: Collection data is relational (user → cards → variants); matches Deck/DeckCard pattern
- **Alternatives**: Redis for caching price data (already in use for sessions)

### Card Data Source

- **Decision**: Existing Card/Variant/Set models + Sorcery Public API for updates
- **Rationale**: Complete card database already exists; api.sorcerytcg.com available for sync
- **API Note**: Official API at https://api.sorcerytcg.com/ provides card data (not pricing); rate-limited; images available via Google Drive folder

### Pricing Data Source

- **Decision**: Abstracted pricing provider interface; start with TCGPlayer affiliate links
- **Rationale**: TCGPlayer API no longer granting new access; affiliate program still available for links and potential revenue
- **Alternatives Considered**:
  - **TCGPlayer Direct API**: Not available for new applications
  - **sorcery.market**: Has live pricing data; could scrape but fragile
  - **sorcerytcg.gg**: Community site with pricing; no public API
- **Future Options**:
  - Partner with existing price data providers
  - Community-submitted pricing data
  - Scraper microservice (legal/ToS concerns)
  - TCGPlayer Affiliate Program provides link generation but not programmatic pricing

### Testing

- **Decision**: Vitest (existing setup) for unit/integration tests
- **Rationale**: Already configured in project; matches existing patterns

### Target Platform

- **Decision**: Web (desktop + mobile responsive)
- **Rationale**: Existing PWA infrastructure; no native app requirements

---

## Key Research Findings

### Existing Patterns to Reuse

1. **Prisma Models**: `Deck`/`DeckCard` pattern directly applicable to `Collection`/`CollectionCard`
   - Same card/variant/set relationships
   - Same user ownership pattern
2. **API Routes**: `/api/decks/*` pattern applicable to `/api/collection/*`
   - CRUD operations
   - Auth middleware via `getServerAuthSession()`
3. **Card Search**: `/api/cards/search` already handles card lookup by name/set/type
   - Reusable for collection browser
4. **Deck Editor**: `/decks/editor-3d` patterns for card grid display

   - `SearchResult` type for card display
   - `DraggableCard3D` for visual representation
   - Filtering/search UI components

5. **Card Assets**: Existing asset routes serve card images
   - `/api/assets/[...path]` handles CDN redirect

### Pricing Integration Strategy

Given TCGPlayer API restrictions, implement a **provider abstraction**:

```typescript
interface PriceProvider {
  getPrice(
    cardId: number,
    variantId: number,
    finish: Finish
  ): Promise<PriceData | null>;
  getBulkPrices(cards: CardRef[]): Promise<Map<string, PriceData>>;
  getAffiliateLink(cardId: number, variantId: number): string;
}

interface PriceData {
  marketPrice: number | null;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  currency: "USD" | "EUR";
  lastUpdated: Date;
  source: "tcgplayer" | "manual" | "community";
}
```

**Phase 1 Implementation**: Generate affiliate links to TCGPlayer search pages
**Phase 2 Future**: Add pricing data when source becomes available

### Quick Add UX Research

Optimal flow for rapid card entry:

1. **Search-as-you-type** with instant results
2. **One-click add** with default quantity 1, Standard finish
3. **Quantity spinner** inline, no modal
4. **Recent cards** section for repeat adds
5. **Batch mode** toggle for adding multiple cards in sequence

### Performance Considerations

- **Large collections**: Paginate API responses (50-100 cards per page)
- **Price caching**: Redis cache with 1-hour TTL for price data
- **Card images**: Leverage existing TextureCache and lazy loading
- **Stats computation**: Server-side aggregation, cache in collection summary

---

## Schema Design Direction

New models following existing patterns:

```
CollectionCard (mirrors DeckCard pattern)
├── id: Int (autoincrement)
├── userId: String (direct user relation, unlike DeckCard)
├── cardId: Int → Card
├── setId: Int? → Set
├── variantId: Int? → Variant
├── finish: Finish (enum: Standard, Foil)
├── quantity: Int (1-99)
├── createdAt: DateTime
├── updatedAt: DateTime

Unique constraint: [userId, cardId, variantId, finish]
```

No separate `Collection` container needed - cards are directly user-owned.

---

## Dependencies Identified

### Required (Existing)

- Prisma Client
- NextAuth session
- Card/Variant/Set models
- Card search API
- Asset routes

### Required (New)

- Redis cache for pricing (already available, new usage)
- Environment variable: `TCGPLAYER_AFFILIATE_ID` (optional)

### Optional (Future)

- TCGPlayer API key (if access granted)
- Price scraper service
- Community price submission system

---

## Risk Assessment

| Risk                          | Likelihood | Impact | Mitigation                                                         |
| ----------------------------- | ---------- | ------ | ------------------------------------------------------------------ |
| TCGPlayer API never available | High       | Medium | Design with abstraction; affiliate links provide value without API |
| Large collection performance  | Medium     | Medium | Pagination, caching, lazy loading                                  |
| Price data accuracy           | Medium     | Low    | Display "estimated" label; link to source                          |
| Card data sync                | Low        | Low    | Existing ingest scripts handle updates                             |

---

## Recommendations

1. **Proceed without real-time pricing** for MVP - affiliate links provide value
2. **Build provider abstraction** to allow future pricing sources
3. **Reuse deck editor patterns** heavily for collection browser UI
4. **Direct user→card relationship** (no container model) for simpler queries
5. **Add pricing UI placeholders** that can be populated when data available

---
