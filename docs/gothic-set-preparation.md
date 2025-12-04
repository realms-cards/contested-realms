# Gothic Set Preparation Guide

This document outlines all steps needed to add the Gothic set to Contested Realms.

## Pre-requisites

- [ ] Gothic card data available in Curiosa API (`https://api.sorcerytcg.com/api/cards`)
- [ ] Gothic card art images in `cardart/original/` folder

---

## Part 1: Hardcoded Set Locations (Need Updates)

### High Priority - UI Set Selection

| File                            | Lines              | What's Hardcoded                                          |
| ------------------------------- | ------------------ | --------------------------------------------------------- |
| `src/app/online/lobby/page.tsx` | 333, 352           | Default pack counts `{ Beta: 6, "Arthurian Legends": 0 }` |
| `src/app/online/lobby/page.tsx` | 1452               | UI set array `["Beta", "Arthurian Legends"]`              |
| `src/app/tournaments/page.tsx`  | 305-307            | Default booster arrays                                    |
| `src/app/tournaments/page.tsx`  | 904-908, 1069-1073 | Set dropdown `<option>` elements                          |

### Medium Priority - Fallbacks

| File                                 | Lines  | What's Hardcoded                       |
| ------------------------------------ | ------ | -------------------------------------- |
| `src/lib/tournament/draft-config.ts` | 43, 55 | Fallback `setId: "Beta"`               |
| `src/lib/booster.ts`                 | 244    | Avatar replacement only for Alpha/Beta |

### Configuration Files

| File                                 | Action                        |
| ------------------------------------ | ----------------------------- |
| `scripts/seed-pack-config.js`        | Add Gothic pack configuration |
| `src/app/api/images/[slug]/route.ts` | Add Gothic set prefix mapping |

---

## Part 2: Ingestion Steps

### Step 1: Ingest Cards from API

```bash
npm run ingest:cards
```

This will:

- Fetch all cards from `https://api.sorcerytcg.com/api/cards`
- Create the `Gothic` set in the database
- Create all card variants with their slugs
- Save raw snapshot to `data/cards_raw.json`

**Verify:** Check `data/cards_raw.json` for Gothic entries and note the slug prefix (likely `got_` or `gth_`).

### Step 2: Add Gothic to Image Routing

Edit `src/app/api/images/[slug]/route.ts`:

```typescript
// Around line 8-22, add Gothic case:
function setDirFromSlug(slug: string): string | null {
  const code = slug.slice(0, 3);
  switch (code) {
    case "alp":
      return "alpha";
    case "bet":
      return "beta";
    case "art":
      return "arthurian_legends";
    case "dra":
    case "drl":
      return "dragonlord";
    case "got": // ADD THIS
    case "gth":
      return "gothic"; // ADD THIS
    default:
      return null;
  }
}
```

### Step 3: Seed Gothic Pack Configuration

Edit `scripts/seed-pack-config.js`, add after Arthurian Legends:

```javascript
// Gothic (TBD - update pack structure when known)
const gothic = await upsertSet("Gothic");
await upsertPackConfig(gothic.id, {
  ordinaryCount: 11, // Adjust based on actual pack structure
  exceptionalCount: 3,
  eliteOrUniqueCount: 1,
  uniqueChance: 0.2, // 20% - standard rate
  siteOrAvatarCount: 0,
  foilChance: 0.25,
  foilUniqueWeight: 1,
  foilEliteWeight: 3,
  foilExceptionalWeight: 6,
  foilOrdinaryWeight: 7,
  foilReplacesOrdinary: true,
});
```

Then run:

```bash
npm run seed:packs
```

---

## Part 3: Process Card Art

### Step 1: Add Gothic art to `cardart/original/`

Gothic files should follow the naming convention:

- Format: `got-cardname-b-s.png` or `got-cardname-b-f.png`
- Example: `got-vampire_lord-b-s.png`

### Step 2: Process art into data folder

```bash
# Dry run first to verify
npm run assets:process -- --dryRun --set gothic

# If looks good, run for real
npm run assets:process:gothic
```

### Step 3: Generate optimized formats

```bash
# Generate WebP versions
npm run assets:webp:out

# Generate KTX2 versions (for 3D)
npm run assets:compress:out
```

### Step 4: Upload to CDN

Upload these folders to your CDN:

- `data-webp/gothic/` → CDN `data-webp/gothic/`
- `data-ktx2/gothic/` → CDN `data-ktx2/gothic/`

---

## Part 4: Update UI Set Lists

### Option A: Dynamic Sets from API (Recommended)

Create an API endpoint to fetch available sets:

```typescript
// src/app/api/sets/route.ts
export async function GET() {
  const sets = await prisma.set.findMany({
    where: { packConfig: { isNot: null } },
    select: { name: true },
    orderBy: { releasedAt: "desc" },
  });
  return Response.json(sets.map((s) => s.name));
}
```

Then use this in lobby/tournament pages instead of hardcoded arrays.

### Option B: Manual Update (Quick fix)

Update the hardcoded arrays in:

1. `src/app/online/lobby/page.tsx` line 1452:

```typescript
{["Beta", "Arthurian Legends", "Gothic"].map((set) => {
```

2. `src/app/tournaments/page.tsx` lines 904-908 and 1069-1073:

```tsx
<option value="Beta">Beta</option>
<option value="Arthurian Legends">Arthurian Legends</option>
<option value="Gothic">Gothic</option>  {/* ADD */}
<option value="Alpha">Alpha</option>
```

---

## Part 5: Verification Checklist

- [ ] `npm run ingest:cards` completes without errors
- [ ] Gothic set appears in database (`SELECT * FROM "Set" WHERE name = 'Gothic'`)
- [ ] Gothic variants in database (`SELECT COUNT(*) FROM "Variant" WHERE "setId" = X`)
- [ ] Gothic appears in set dropdowns (lobby, tournaments)
- [ ] Gothic boosters can be generated (`npm run seed:packs` then test in draft)
- [ ] Card images load correctly for Gothic cards
- [ ] Search index includes Gothic cards (`npm run generate-search-index`)

---

## Image Naming Convention Note

Curiosa changed their file naming:

- **Old (API slugs):** `alp_apprentice_wizard_b_s` (underscores)
- **New (downloaded files):** `alp-abundance-b-f.png` (dash after prefix)

The `scripts/process-card-art.js` script handles this conversion automatically.

---

## Quick Reference: Set Prefixes

| Set               | Prefix               | Directory            | Pack Type                |
| ----------------- | -------------------- | -------------------- | ------------------------ |
| Alpha             | `alp`                | `alpha/`             | Random (15 cards)        |
| Beta              | `bet`                | `beta/`              | Random (15 cards)        |
| Arthurian Legends | `arl` or `art`       | `arthurian_legends/` | Random (15 cards)        |
| Dragonlord        | `drl` or `dra`       | `dragonlord/`        | **Fixed** (all 26 cards) |
| Gothic            | `got` or `gth` (TBC) | `gothic/`            | Random (15 cards)        |

## Mini-Set (Fixed Pack) Configuration

For mini-sets like Dragonlord where each booster contains ALL cards from the set:

```javascript
// In scripts/seed-pack-config.js
await upsertPackConfig(miniSet.id, {
  ordinaryCount: 0,
  exceptionalCount: 0,
  eliteOrUniqueCount: 0,
  uniqueChance: 0,
  siteOrAvatarCount: 0,
  foilChance: 0,
  // ... all weights 0
  isFixedPack: true, // This flag makes it return ALL cards
});
```

The `isFixedPack: true` flag in PackConfig causes `generateBooster()` to return all Standard finish variants from the set instead of random selection.

---

## Rollback Plan

If issues arise:

1. Remove Gothic from pack config: Delete from `scripts/seed-pack-config.js` and re-run
2. Hide from UI: Remove from hardcoded arrays temporarily
3. Card data stays harmless in DB until pack config exists
