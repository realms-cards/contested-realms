---
description: How to add a status effect icon for a card with a persistent board-altering ability
---

# Adding a Status Effect Icon

Status effect icons appear in the top-right corner of the game screen when a card with a persistent, board-altering ability is on the board. They cluster when collapsed and expand on hover to show details. Examples: **Atlantean Fate** (flood zones), **Mismanaged Mortuary** (cemetery swap), **Garden of Eden** (draw limit), **Boudicca** (ally power boost).

## Steps

### 1. Determine the card's image slug

Look up the card in `data/cards_raw.json` to find its variant slug. Use the standard (`_b_s` suffix) variant for the icon.

```
const MY_CARD_IMAGE_URL = "/api/images/<slug>";
```

### 2. Add the effect type to `StatusEffectIcons.tsx`

Open `src/components/game/StatusEffectIcons.tsx`.

**a) Add the image URL constant** at the top with the other card image URLs:

```typescript
const MY_CARD_IMAGE_URL = "/api/images/<set>-<card>-b-s";
```

**b) Add the effect type** to the `effectType` union in the `StatusEffect` interface:

```typescript
effectType:
  | "mortuary"
  | "atlanteanFate"
  | "gardenOfEden"
  | "counter"
  | "aura"
  | "boudicca"
  | "myNewEffect"; // <-- add here
```

**c) Add a detection block** inside the `useMemo` in `PlayerStatusEffects`. Use an **indexed loop** (not `for..of`) so you can pass the correct index to the silence checker:

```typescript
import { isPermanentSilenced } from "@/lib/game/store/boudiccaState";
import type { CellKey, Permanents } from "@/lib/game/store/types";

// --- My Card Effect ---
// "Card ability text here"
for (const [cellKey, cellPerms] of Object.entries(permanents)) {
  const perms = cellPerms || [];
  for (let idx = 0; idx < perms.length; idx++) {
    const perm = perms[idx];
    if (perm.attachedTo) continue; // skip attachments
    if ((perm.card?.name || "").toLowerCase() !== "my card name") continue;
    const ownerSeat: PlayerKey = perm.owner === 1 ? "p1" : "p2";

    // Check if silenced/disabled using the shared helper
    const isSilenced = isPermanentSilenced(
      permanents as Permanents,
      cellKey as CellKey,
      idx,
    );

    effects.push({
      id: `my-effect-${cellKey}-${perm.instanceId || "x"}`,
      imageUrl: MY_CARD_IMAGE_URL,
      title: "My Card",
      description: isSilenced ? "Effect suppressed" : "Effect description",
      controllerSeat: ownerSeat,
      effectType: "myNewEffect",
      isSilenced,
    });
  }
}
```

> **Important:** Do NOT use `indexOf(perm)` to find the permanent's index — it matches by reference identity and produces wrong results when the same cell has multiple permanents. Always use an indexed `for` loop.

### 3. Import helper functions

- `isPermanentSilenced(permanents, cellKey, index)` from `boudiccaState.ts` — checks if a permanent has a Silenced or Disabled attachment. **Always use this** for silence detection on minions/auras.
- If the card has a name-detection helper (e.g., `isBoudicca`), import and reuse it instead of inline string matching.
- Keep imports ordered: `@/lib/game/store` → `@/lib/game/store/<submodule>` → `@/lib/game/store/utils/*`.

### 4. For site-based effects (Atlantean Fate, Mortuary pattern)

If the effect comes from a **site** rather than a minion/aura:

- Use `boardSites[cellKey]` to check if the site still exists
- Use `siteHasSilencedToken(cellKey, permanents)` from `@/lib/game/store/utils/resourceHelpers` for silence detection
- Register the site in a dedicated state slice (see `specialSiteState.ts` for the Mortuary/Atlantean Fate pattern)

### 5. For effects tracked via dedicated state (complex cases)

Some effects need their own state slice (e.g., `atlanteanFateState.ts`, `specialSiteState.ts`). These store aura IDs, affected cells, etc. Subscribe to the state in `PlayerStatusEffects` via `useGameStore` selectors and iterate over the state entries.

### 6. Verify

- Run `npx eslint src/components/game/StatusEffectIcons.tsx --quiet` — should report no errors
- Test in-game: place the card on the board and confirm the icon appears
- Hover over the icon cluster to see the expanded description
- Test with a "Silenced" or "Disabled" token attached — icon should show strikethrough and "Effect suppressed"

## File reference

| File                                          | Purpose                                                     |
| --------------------------------------------- | ----------------------------------------------------------- |
| `src/components/game/StatusEffectIcons.tsx`   | UI component — renders clustered status effect icons        |
| `src/lib/game/store/types.ts`                 | Type definitions for state (e.g., `SpecialSiteState`)       |
| `src/lib/game/store/specialSiteState.ts`      | State slice for site-based effects (Mortuary, Valley, etc.) |
| `src/lib/game/store/atlanteanFateState.ts`    | State slice for Atlantean Fate auras                        |
| `src/lib/game/store/boudiccaState.ts`         | Helper functions for Boudicca detection                     |
| `src/lib/game/store/utils/resourceHelpers.ts` | `siteHasSilencedToken()` utility                            |
| `data/cards_raw.json`                         | Card data — look up slugs here                              |

## Checklist

- [ ] Image URL constant added
- [ ] `effectType` union extended
- [ ] Detection block added in `useMemo`
- [ ] Silenced/Disabled check included
- [ ] Lint passes
- [ ] Tested in-game (icon appears, expands on hover, shows silenced state)
