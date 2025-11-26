# Quickstart: Collection Tracker

**Feature**: Collection Tracker  
**Branch**: `010-collection-tracker-track`

---

## Prerequisites

1. Local development environment running (`npm run dev`)
2. Socket.IO server running (`npm run server`)
3. Database migrated with collection schema
4. Authenticated user session

---

## Quick Validation Steps

### 1. Navigate to Collection Page

```
URL: http://localhost:3000/collection
Expected: Empty collection page with "Start Adding Cards" prompt
```

### 2. Add First Card to Collection

1. Click "Browse All Cards" or use Quick Add
2. Search for "Apprentice Wizard"
3. Click "Add to Collection"
4. Verify card appears in collection grid with quantity badge "1"

### 3. Update Card Quantity

1. Click on Apprentice Wizard in collection
2. Use +/- buttons to change quantity to 4
3. Verify quantity badge updates to "4"
4. Reduce quantity to 0
5. Verify card is removed from collection

### 4. Add Multiple Cards (Quick Add)

1. Click "Quick Add" button
2. Search and add rapidly:
   - 4x Polar Bears
   - 2x Spire
   - 2x Valley
   - 2x Stream
   - 2x Wasteland
3. Verify all cards appear in collection

### 5. View Collection Statistics

1. Navigate to Stats tab/section
2. Verify displays:
   - Total cards: 12
   - Unique cards: 5
   - Set completion percentage
   - Element breakdown

### 6. Create Collection Deck

1. Click "Build Deck from Collection"
2. Create new deck "Test Collection Deck"
3. Add cards from your collection
4. Verify:
   - Can only add owned cards
   - Quantity limited to owned amount
   - Available quantity shown during selection

### 7. Test Ownership Enforcement

1. Try adding 5x Polar Bears to deck (you own 4)
2. Verify error: "Exceeds owned quantity"
3. Add 4x Polar Bears (should succeed)
4. Verify remaining available shows "0"

### 8. Export Deck to Simulator

1. Complete a valid deck (40+ spellbook, 12+ atlas, 1 avatar)
2. Click "Export to Simulator"
3. Verify deck appears in main /decks page
4. Verify exported deck can be used in Play

### 9. Test Pricing Display

1. View any card in collection
2. Verify price shows (or "N/A" if no data)
3. Click "Buy on TCGPlayer" link
4. Verify affiliate link opens correct search

### 10. Import Collection from Text

1. Navigate to Import section
2. Paste text:
   ```
   4 Apprentice Wizard
   2 Dragon Lord
   1 Spellslinger
   ```
3. Click Import
4. Verify cards added to collection

---

## API Smoke Tests

### List Collection

```bash
curl -X GET "http://localhost:3000/api/collection" \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN"
```

### Add Card

```bash
curl -X POST "http://localhost:3000/api/collection" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN" \
  -d '{"cards":[{"cardId":456,"variantId":789,"finish":"Standard","quantity":1}]}'
```

### Get Stats

```bash
curl -X GET "http://localhost:3000/api/collection/stats" \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN"
```

### Get Pricing

```bash
curl -X GET "http://localhost:3000/api/pricing/card/456"
```

---

## Success Criteria Checklist

- [ ] Can navigate to /collection from main page
- [ ] Empty state shows helpful onboarding
- [ ] Can add cards with quantity and finish selection
- [ ] Can update quantity (increase/decrease)
- [ ] Quantity 0 removes card from collection
- [ ] Collection grid shows card images with quantity badges
- [ ] Foil cards visually distinguished
- [ ] Filter by set, element, type, rarity works
- [ ] Search by card name works
- [ ] Collection statistics accurate
- [ ] Set completion percentage shown
- [ ] Missing cards view works
- [ ] Can create collection-based deck
- [ ] Deck enforces ownership limits
- [ ] Can export valid deck to simulator
- [ ] Exported deck playable in online/offline
- [ ] Pricing displays (or N/A gracefully)
- [ ] TCGPlayer links work
- [ ] Batch import from text works
- [ ] Performance acceptable with 500+ cards

---

## Common Issues

### "Card not found" on add

- Ensure card database is seeded (`npm run ingest:cards`)
- Check cardId exists in database

### Collection not saving

- Verify authenticated session
- Check browser console for API errors
- Verify Prisma migration ran

### Prices not showing

- Expected for MVP - affiliate links should still work
- Check Redis connection if caching enabled

### Deck export fails

- Verify deck meets minimum requirements
- Check for ownership validation errors

---
