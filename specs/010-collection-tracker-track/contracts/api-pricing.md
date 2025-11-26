# API Contract: Card Pricing

**Base Path**: `/api/pricing`  
**Auth**: Optional (pricing is public data)

---

## Overview

Pricing endpoints provide market value data for cards.
Initial implementation uses TCGPlayer affiliate links.
Future: real-time pricing from API when available.

---

## Endpoints

### GET /api/pricing/card/[cardId]

Get pricing for a specific card (all variants).

**Path Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| cardId | number | Card ID |

**Query Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| variantId | number? | Specific variant |
| finish | string? | Standard or Foil |

**Response 200**:

```json
{
  "cardId": 456,
  "cardName": "Apprentice Wizard",
  "prices": [
    {
      "variantId": 789,
      "setName": "Beta",
      "finish": "Standard",
      "marketPrice": 0.5,
      "lowPrice": 0.25,
      "midPrice": 0.45,
      "highPrice": 1.0,
      "currency": "USD",
      "source": "tcgplayer",
      "lastUpdated": "2025-11-26T20:00:00Z",
      "affiliateUrl": "https://www.tcgplayer.com/search/sorcery-contested-realm/product?q=Apprentice+Wizard&view=grid"
    },
    {
      "variantId": 790,
      "setName": "Beta",
      "finish": "Foil",
      "marketPrice": 2.5,
      "lowPrice": 1.5,
      "midPrice": 2.25,
      "highPrice": 4.0,
      "currency": "USD",
      "source": "tcgplayer",
      "lastUpdated": "2025-11-26T20:00:00Z",
      "affiliateUrl": "https://www.tcgplayer.com/search/sorcery-contested-realm/product?q=Apprentice+Wizard+Foil&view=grid"
    }
  ]
}
```

**Response 200** (no pricing data):

```json
{
  "cardId": 456,
  "cardName": "Apprentice Wizard",
  "prices": [],
  "message": "No pricing data available",
  "affiliateUrl": "https://www.tcgplayer.com/search/sorcery-contested-realm/product?q=Apprentice+Wizard&view=grid"
}
```

---

### POST /api/pricing/bulk

Get pricing for multiple cards at once.

**Request Body**:

```json
{
  "cards": [
    { "cardId": 456, "variantId": 789, "finish": "Standard" },
    { "cardId": 789, "variantId": 890, "finish": "Foil" }
  ]
}
```

**Response 200**:

```json
{
  "prices": {
    "456:789:Standard": {
      "marketPrice": 0.5,
      "currency": "USD",
      "affiliateUrl": "..."
    },
    "789:890:Foil": {
      "marketPrice": 150.0,
      "currency": "USD",
      "affiliateUrl": "..."
    }
  },
  "notFound": [],
  "cacheHit": true
}
```

---

### GET /api/pricing/affiliate-link

Generate TCGPlayer affiliate link for a card.

**Query Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| cardName | string | Card name |
| setName | string? | Set name |
| finish | string? | Standard or Foil |

**Response 200**:

```json
{
  "url": "https://www.tcgplayer.com/search/sorcery-contested-realm/product?q=Apprentice+Wizard&view=grid&ProductTypeName=Cards",
  "affiliateId": "realms_cards"
}
```

---

### GET /api/pricing/refresh

Force refresh pricing data (rate-limited).

**Query Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| cardId | number? | Specific card |
| setId | number? | All cards in set |

**Response 200**:

```json
{
  "status": "queued",
  "estimatedTime": 60,
  "message": "Price refresh queued"
}
```

**Response 429** (rate limited):

```json
{
  "error": "Rate limited",
  "retryAfter": 3600
}
```

---

## Caching Strategy

| Cache Level     | TTL      | Storage       |
| --------------- | -------- | ------------- |
| Response        | 5 min    | Next.js cache |
| Price data      | 1 hour   | Redis         |
| Affiliate links | 24 hours | Redis         |

---

## Price Data Sources

### Current (MVP)

- **TCGPlayer Affiliate Links**: Generated dynamically, no API needed
- **Manual Entry**: Admin can set prices for specific cards

### Future (when available)

- **TCGPlayer API**: Real-time market data
- **Community Submitted**: User-reported prices with moderation
- **sorcery.market**: Scraper integration

---

## Type Definitions

```typescript
interface PriceData {
  variantId: number;
  setName: string;
  finish: "Standard" | "Foil";
  marketPrice: number | null;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  currency: "USD" | "EUR";
  source: "tcgplayer" | "manual" | "community";
  lastUpdated: string;
  affiliateUrl: string;
}

interface BulkPriceRequest {
  cards: Array<{
    cardId: number;
    variantId?: number;
    finish?: "Standard" | "Foil";
  }>;
}

interface PriceProvider {
  name: string;
  getPrice(
    cardId: number,
    variantId: number,
    finish: string
  ): Promise<PriceData | null>;
  getAffiliateLink(cardName: string, setName?: string): string;
  refreshPrices(cardIds: number[]): Promise<void>;
}
```

---

## Environment Variables

| Variable               | Required | Description                          |
| ---------------------- | -------- | ------------------------------------ |
| TCGPLAYER_AFFILIATE_ID | No       | TCGPlayer affiliate tracking ID      |
| TCGPLAYER_API_KEY      | No       | API key (future use)                 |
| PRICE_CACHE_TTL        | No       | Cache TTL in seconds (default: 3600) |

---
