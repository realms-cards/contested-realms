# Custom Resolver Framework

Guide for implementing custom card ability resolvers in the Sorcery client.

## Overview

Custom resolvers handle cards with complex abilities that require user interaction beyond the generic magic casting flow. Examples include Browse, Dhol Chants, Demonic Contract, Highland Princess, etc.

## Architecture

A complete custom resolver consists of:

1. **State Slice** (`src/lib/game/store/<cardName>State.ts`)
2. **Overlay Component** (`src/components/game/<CardName>Overlay.tsx`)
3. **Play Action Integration** (`src/lib/game/store/gameActions/playActions.ts`)
4. **Message Handlers** (`src/lib/game/store/customMessageHandlers.ts`)
5. **Type Definitions** (`src/lib/game/store/types.ts`)

---

## 1. State Slice

### File: `src/lib/game/store/<cardName>State.ts`

```typescript
import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type { CardRef, CellKey, GameState, PlayerKey, ServerPatchT } from "./types";

// Unique ID generator for this resolver
function newResolverId() {
  return `<prefix>_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// Phase enum - tracks resolver progress
export type <CardName>Phase =
  | "selecting"    // User selecting targets/options
  | "revealing"    // Showing revealed cards
  | "resolving"    // Processing the effect
  | "complete";    // Done

// Pending state - all data needed for resolution
export type Pending<CardName> = {
  id: string;
  casterSeat: PlayerKey;
  spell: {
    at: CellKey;
    index: number;
    instanceId: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  phase: <CardName>Phase;
  // ... card-specific fields
  createdAt: number;
};

// Slice type definition
export type <CardName>Slice = Pick<
  GameState,
  | "pending<CardName>"
  | "begin<CardName>"
  | "resolve<CardName>"
  | "cancel<CardName>"
  // ... additional methods
>;

// Slice implementation
export const create<CardName>Slice: StateCreator<GameState, [], [], <CardName>Slice> = (set, get) => ({
  pending<CardName>: null,

  begin<CardName>: (input) => {
    const id = newResolverId();
    const casterSeat = input.casterSeat;

    // Set pending state
    set({
      pending<CardName>: {
        id,
        casterSeat,
        spell: input.spell,
        phase: "selecting",
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    // Log action
    get().log(`[${casterSeat.toUpperCase()}] <CardName> begins...`);

    // Broadcast to opponent (for online sync)
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "<cardName>Begin",
          id,
          casterSeat,
          spell: input.spell,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  resolve<CardName>: () => {
    const pending = get().pending<CardName>;
    if (!pending) return;

    // 1. Update game state (zones, permanents, etc.)
    // 2. Send patches via trySendPatch()
    // 3. Broadcast resolution message
    // 4. Clear pending state

    set({ pending<CardName>: null } as Partial<GameState> as GameState);

    get().log(`[${pending.casterSeat.toUpperCase()}] <CardName> resolved`);

    // Broadcast resolution
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "<cardName>Resolve",
          id: pending.id,
          casterSeat: pending.casterSeat,
          // ... result data
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  cancel<CardName>: () => {
    const pending = get().pending<CardName>;
    if (!pending) return;

    // Move spell to graveyard (fizzle)
    get().movePermanentToZone(pending.spell.at, pending.spell.index, "graveyard");

    set({ pending<CardName>: null } as Partial<GameState> as GameState);

    get().log(`[${pending.casterSeat.toUpperCase()}] <CardName> cancelled`);
  },
});
```

### Key Principles

- **Hotseat vs Online**: In hotseat mode (`actorKey === null`), both players share the screen. The caster always controls the UI.
- **State Sync**: Always send patches via `trySendPatch()` for zone/permanent changes.
- **Broadcast**: Send custom messages for opponent awareness and UI updates.

---

## 2. Type Definitions

### File: `src/lib/game/store/types.ts`

Add to the types file:

```typescript
// Near other phase/pending types (~line 800+)
export type <CardName>Phase = "selecting" | "revealing" | "resolving" | "complete";

export type Pending<CardName> = {
  id: string;
  casterSeat: PlayerKey;
  spell: { at: CellKey; index: number; instanceId: string | null; owner: 1 | 2; card: CardRef };
  phase: <CardName>Phase;
  // ... card-specific fields
  createdAt: number;
};

// In GameState interface (~line 1400+)
pending<CardName>: Pending<CardName> | null;
begin<CardName>: (input: { spell: SpellRef; casterSeat: PlayerKey }) => void;
resolve<CardName>: () => void;
cancel<CardName>: () => void;
```

---

## 3. Overlay Component

### File: `src/components/game/<CardName>Overlay.tsx`

```typescript
"use client";

import React from "react";
import { useGameStore } from "@/lib/game/store";
import CardWithPreview, { CardGrid } from "./CardWithPreview";

export default function <CardName>Overlay() {
  const pending = useGameStore((s) => s.pending<CardName>);
  const actorKey = useGameStore((s) => s.actorKey);
  const resolve = useGameStore((s) => s.resolve<CardName>);
  const cancel = useGameStore((s) => s.cancel<CardName>);

  if (!pending) return null;

  const { phase, casterSeat } = pending;

  // Hotseat: actorKey is null, always show caster UI
  // Online: only show caster UI if we're the caster
  const isCaster = actorKey === null || casterSeat === actorKey;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top status bar */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-<color>-500/50 shadow-lg text-lg flex items-center gap-3">
          <span className="text-<color>-400 font-fantaisie">🎴 <CardName></span>
          <span className="opacity-80">{/* Phase-dependent message */}</span>
        </div>
      </div>

      {/* Caster UI */}
      {isCaster && phase === "selecting" && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-3xl w-full mx-4 ring-1 ring-<color>-500/30">
            {/* Card selection using CardWithPreview */}
            <CardGrid columns={5}>
              {cards.map((card, idx) => (
                <CardWithPreview
                  key={idx}
                  card={card}
                  onClick={() => handleSelect(idx)}
                  selected={selectedIndex === idx}
                  accentColor="<color>"
                />
              ))}
            </CardGrid>

            {/* Action buttons */}
            <div className="flex gap-3 justify-center mt-6">
              <button onClick={cancel} className="...">Cancel</button>
              <button onClick={resolve} className="...">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Opponent waiting indicator */}
      {!isCaster && phase !== "complete" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="px-4 py-2 rounded-lg bg-black/90 text-sm text-<color>-300">
            {casterSeat.toUpperCase()} is resolving <CardName>...
          </div>
        </div>
      )}
    </div>
  );
}
```

### Required: Card Preview Integration

**Always use `CardWithPreview`** for displaying cards:

```typescript
import CardWithPreview, { CardGrid } from "./CardWithPreview";

// Single card
<CardWithPreview card={card} onClick={handleClick} accentColor="blue" />

// Grid of cards
<CardGrid columns={5}>
  {cards.map((card, idx) => (
    <CardWithPreview key={idx} card={card} ... />
  ))}
</CardGrid>
```

---

## 4. Play Action Integration

### File: `src/lib/game/store/gameActions/playActions.ts`

Add card detection and routing (~line 435-450):

```typescript
// Add card name check
const is<CardName> = cardNameLower === "<card name lowercase>";

// Add routing before generic magic cast (~line 730)
else if (is<CardName> && newest) {
  try {
    get().begin<CardName>({
      spell: {
        at: key,
        index: arr.length - 1,
        instanceId: newest.instanceId ?? null,
        owner: newest.owner,
        card: newest.card as CardRef,
      },
      casterSeat: who,
    });
  } catch (e) {
    console.error("[playActions] Error triggering <CardName>:", e);
  }
}
```

---

## 5. Message Handlers (Online Sync)

### File: `src/lib/game/store/customMessageHandlers.ts`

Add handlers for each message type:

```typescript
// Near end of handleCustomMessage function

if (t === "<cardName>Begin") {
  const id = (msg as { id?: unknown }).id as string | undefined;
  const casterSeat = (msg as { casterSeat?: unknown }).casterSeat as PlayerKey | undefined;
  // ... extract other fields

  if (!id || !casterSeat) return;

  // Skip if we're the caster - already handled locally
  const actorKey = get().actorKey;
  if (actorKey === casterSeat) {
    console.log("[<CardName>] Skipping - we are the caster");
    return;
  }

  // Set pending state for opponent view
  set({
    pending<CardName>: {
      id,
      casterSeat,
      phase: "selecting",
      // ... other fields
      createdAt: Date.now(),
    },
  } as Partial<GameState> as GameState);
  return;
}

if (t === "<cardName>Resolve") {
  const id = (msg as { id?: unknown }).id as string | undefined;
  const casterSeat = (msg as { casterSeat?: unknown }).casterSeat as PlayerKey | undefined;

  if (!id) return;

  // Skip if we're the caster
  const actorKey = get().actorKey;
  if (actorKey === casterSeat) return;

  // Update/clear pending state
  const pending = get().pending<CardName>;
  if (pending?.id === id) {
    set({
      pending<CardName>: { ...pending, phase: "complete" },
    } as Partial<GameState> as GameState);

    // Clear after delay
    setTimeout(() => {
      set((state) => {
        if (state.pending<CardName>?.id === id) {
          return { ...state, pending<CardName>: null } as GameState;
        }
        return state as GameState;
      });
    }, 500);
  }
  return;
}
```

---

## 6. Store Integration

### File: `src/lib/game/store.ts`

1. Import the slice (alphabetically):

```typescript
import { create<CardName>Slice } from "./store/<cardName>State";
```

2. Add to store creation (~line 185):

```typescript
...create<CardName>Slice(set, get, storeApi),
```

3. Add to `resetGameState()` (~line 300):

```typescript
pending<CardName>: null,
```

This ensures the resolver state is cleared when starting a new match.

---

## 7. Page Integration

### Files: `src/app/play/page.tsx` and `src/app/online/play/[id]/page.tsx`

1. Import the overlay:

```typescript
import <CardName>Overlay from "@/components/game/<CardName>Overlay";
```

2. Add to JSX (near other overlays):

```tsx
<<CardName>Overlay />
```

---

## Checklist for New Resolver

- [ ] Create state slice with begin/resolve/cancel methods
- [ ] Add types to `types.ts` (phase enum, pending type, GameState interface)
- [ ] Create overlay component using `CardWithPreview`
- [ ] Add card detection constant in `playActions.ts` (~line 477)
- [ ] Add trigger routing in `playActions.ts` (after other spell triggers)
- [ ] Add message handlers in `customMessageHandlers.ts` (begin/select/resolve/cancel)
- [ ] Import slice in `store.ts` (alphabetically)
- [ ] Spread slice in store creation (~line 187)
- [ ] Add `pending<CardName>: null` to `resetGameState()` (~line 302)
- [ ] Import overlay in both play pages
- [ ] Add overlay component to JSX in both play pages
- [ ] Test hotseat mode (both players see correct UI)
- [ ] Test online mode (caster controls, opponent sees status)
- [ ] Verify zone patches send FULL seat zones
- [ ] Check resolver respects `resolversDisabled` toggle (if applicable)

---

## Common Patterns

### Zone Manipulation

**CRITICAL: Always send FULL seat zones in patches to prevent data loss**

#### The Seven Zones

Every player has seven zones that must be managed:

1. **spellbook** - Main deck of spells
2. **atlas** - Site deck
3. **hand** - Cards in hand
4. **graveyard** - Discarded/destroyed cards
5. **battlefield** - Cards on the battlefield (rarely modified directly)
6. **collection** - Special zone for sealed/draft unplayed cards and avatar abilities
7. **banished** - Permanently removed cards

#### Pattern 1: Modifying Only Some Zones (WRONG ❌)

```typescript
// ❌ WRONG - Partial zones can cause data loss
const zonesNext = {
  ...zones,
  [seat]: {
    spellbook: newSpellbook,
    hand: newHand,
    // Missing: atlas, graveyard, battlefield, collection, banished
  },
};

get().trySendPatch({
  zones: { [seat]: zonesNext[seat] },
});
```

**Problem:** When the opponent receives this patch, their merge logic may wipe out the missing zones (atlas, graveyard, etc.) because they weren't included.

#### Pattern 2: Full Zone Patch (CORRECT ✅)

```typescript
// ✅ CORRECT - Include ALL seven zones
const state = get();
const zones = state.zones;

// Modify only what you need
const spellbook = [...zones[seat].spellbook];
const hand = [...zones[seat].hand];
spellbook.splice(0, 5); // Remove top 5
hand.push(selectedCard); // Add to hand

// Build COMPLETE zone object with ALL seven zones
const targetZones = {
  spellbook: spellbook,
  atlas: [...zones[seat].atlas], // Unchanged - copy as-is
  hand: hand,
  graveyard: [...zones[seat].graveyard], // Unchanged - copy as-is
  battlefield: [...zones[seat].battlefield], // Unchanged - copy as-is
  collection: [...zones[seat].collection], // Unchanged - copy as-is
  banished: [...zones[seat].banished], // Unchanged - copy as-is
};

const zonesNext = { ...zones, [seat]: targetZones };

set({ zones: zonesNext } as Partial<GameState> as GameState);

// Send FULL seat zones
get().trySendPatch({
  zones: { [seat]: targetZones },
} as ServerPatchT);
```

**Why this works:** The opponent receives ALL zone data, so nothing gets lost during the merge.

### Zone Manipulation Examples

#### Example 1: Search and Draw (Browse, Common Sense)

```typescript
const state = get();
const zones = state.zones;
const spellbook = [...zones[casterSeat].spellbook];
const hand = [...zones[casterSeat].hand];

// Remove selected card from spellbook
const cardIndex = spellbook.findIndex((c) => c.cardId === selectedCard.cardId);
if (cardIndex !== -1) {
  spellbook.splice(cardIndex, 1);
  hand.push(selectedCard);
}

// Shuffle spellbook
for (let i = spellbook.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [spellbook[i], spellbook[j]] = [spellbook[j], spellbook[i]];
}

// FULL zone patch
const targetZones = {
  spellbook,
  atlas: [...zones[casterSeat].atlas],
  hand,
  graveyard: [...zones[casterSeat].graveyard],
  battlefield: [...zones[casterSeat].battlefield],
  collection: [...zones[casterSeat].collection],
  banished: [...zones[casterSeat].banished],
};

const zonesNext = { ...zones, [casterSeat]: targetZones };
set({ zones: zonesNext } as Partial<GameState> as GameState);
get().trySendPatch({ zones: { [casterSeat]: targetZones } } as ServerPatchT);
```

#### Example 2: Banish from Collection (Legion of Gall)

```typescript
const state = get();
const zones = state.zones;
const collection = [...zones[targetSeat].collection];

// Remove selected cards (in reverse order to preserve indices)
selectedIndices
  .sort((a, b) => b - a)
  .forEach((idx) => {
    if (idx >= 0 && idx < collection.length) {
      collection.splice(idx, 1);
    }
  });

// Add to banished
const banished = [...zones[targetSeat].banished, ...cardsToRemove];

// FULL zone patch for target seat
const targetZones = {
  spellbook: [...zones[targetSeat].spellbook],
  atlas: [...zones[targetSeat].atlas],
  hand: [...zones[targetSeat].hand],
  graveyard: [...zones[targetSeat].graveyard],
  battlefield: [...zones[targetSeat].battlefield],
  collection,
  banished,
};

const zonesNext = { ...zones, [targetSeat]: targetZones };
set({ zones: zonesNext } as Partial<GameState> as GameState);
get().trySendPatch({ zones: { [targetSeat]: targetZones } } as ServerPatchT);
```

#### Example 3: Reveal Top Cards (Browse)

```typescript
const state = get();
const zones = state.zones;
const spellbook = [...zones[casterSeat].spellbook];
const hand = [...zones[casterSeat].hand];

// Remove top 5 cards
const revealed = spellbook.splice(0, 5);

// Player selects one for hand
if (selectedCard) {
  hand.push(selectedCard);
}

// Put rest on bottom in specified order
const bottomCards = pending.bottomOrder.map((i) => revealed[i]);
spellbook.push(...bottomCards);

// FULL zone patch
const targetZones = {
  spellbook,
  atlas: [...zones[casterSeat].atlas],
  hand,
  graveyard: [...zones[casterSeat].graveyard],
  battlefield: [...zones[casterSeat].battlefield],
  collection: [...zones[casterSeat].collection],
  banished: [...zones[casterSeat].banished],
};

const zonesNext = { ...zones, [casterSeat]: targetZones };
set({ zones: zonesNext } as Partial<GameState> as GameState);
get().trySendPatch({ zones: { [casterSeat]: targetZones } } as ServerPatchT);
```

---

## Common Pitfalls and Solutions

### Pitfall 1: Partial Zone Patches

**Problem:** Only sending modified zones causes data loss.

```typescript
// ❌ WRONG
get().trySendPatch({
  zones: {
    [seat]: {
      spellbook: newSpellbook,
      hand: newHand,
    },
  },
});
```

**Solution:** Always include all seven zones.

```typescript
// ✅ CORRECT
const targetZones = {
  spellbook: newSpellbook,
  atlas: [...zones[seat].atlas],
  hand: newHand,
  graveyard: [...zones[seat].graveyard],
  battlefield: [...zones[seat].battlefield],
  collection: [...zones[seat].collection],
  banished: [...zones[seat].banished],
};

get().trySendPatch({ zones: { [seat]: targetZones } });
```

### Pitfall 2: Mutating Arrays Directly

**Problem:** Modifying zone arrays without copying breaks immutability.

```typescript
// ❌ WRONG
const zones = get().zones;
zones[seat].hand.push(card); // Mutates state directly!
```

**Solution:** Always create new arrays.

```typescript
// ✅ CORRECT
const zones = get().zones;
const hand = [...zones[seat].hand, card];
```

### Pitfall 3: Forgetting to Update Local State

**Problem:** Sending patch without updating local state causes desync.

```typescript
// ❌ WRONG
get().trySendPatch({ zones: { [seat]: targetZones } });
// Forgot to call set()!
```

**Solution:** Always update local state first.

```typescript
// ✅ CORRECT
const zonesNext = { ...zones, [seat]: targetZones };
set({ zones: zonesNext } as Partial<GameState> as GameState);
get().trySendPatch({ zones: { [seat]: targetZones } } as ServerPatchT);
```

### Pitfall 4: Wrong Removal Order

**Problem:** Removing multiple items by index without sorting causes wrong items removed.

```typescript
// ❌ WRONG - Indices shift after first removal
selectedIndices.forEach((idx) => collection.splice(idx, 1));
```

**Solution:** Sort indices in descending order.

```typescript
// ✅ CORRECT - Remove from end to start
selectedIndices
  .sort((a, b) => b - a)
  .forEach((idx) => {
    collection.splice(idx, 1);
  });
```

### Pitfall 5: Cross-Player Zone Updates (CRITICAL)

**Problem:** Some resolvers need to modify opponent zones (Legion of Gall banishes from opponent's collection, Pith Imp steals from opponent's hand).

**IMPORTANT:** The server blocks zone patches for opponent's seat! You CANNOT use `trySendPatch` to update opponent zones - the server will drop/filter these patches.

**Solution:** Use **custom messages** and let the opponent update their OWN zones:

```typescript
// ❌ WRONG - Server will block this!
get().trySendPatch({
  zones: { [opponentSeat]: opponentZones },
} as ServerPatchT);

// ✅ CORRECT - Send custom message with full card data
transport.sendMessage({
  type: "legionOfGallResolve",
  id: pending.id,
  casterSeat,
  targetSeat,
  selectedIndices,
  cardsToBanish, // Include full card data!
  ts: Date.now(),
} as unknown as CustomMessage);
```

**In the message handler (opponent's client):**

```typescript
if (t === "legionOfGallResolve") {
  // Skip if we're the caster - already handled locally
  if (actorKey === casterSeat) {
    set({ pendingLegionOfGall: null });
    return;
  }

  // We are the target - update OUR OWN zones
  if (actorKey === targetSeat && cardsToBanish) {
    const collection = [...zones[targetSeat].collection];
    const banished = [...zones[targetSeat].banished];

    // Remove from collection, add to banished
    sortedIndices.forEach((idx) => collection.splice(idx, 1));
    banished.push(...cardsToBanish);

    set({
      zones: {
        ...zones,
        [targetSeat]: { ...zones[targetSeat], collection, banished },
      },
    });
  }
}
```

**Reference implementation:** See `pithImpState.ts` lines 314-316 for the pattern note.

### Pitfall 6: Server-Side Message Routing (CRITICAL)

**Problem:** Custom messages are NOT automatically broadcast by the server. The server's `socket.on("message")` handler in `server/index.ts` only routes **explicitly listed message types**.

**Symptom:** Caster's client sends the message successfully, but opponent's client never receives it (no handler logs fire).

**Solution:** Register ALL new resolver message types in `server/index.ts` (around line 4001):

```typescript
} else if (
  type === "chaosTwisterBegin" ||
  // ... existing types ...
  type === "accusationCancel" ||
  // ADD YOUR NEW RESOLVER MESSAGE TYPES HERE:
  type === "legionOfGallBegin" ||
  type === "legionOfGallSelect" ||
  type === "legionOfGallResolve" ||
  type === "legionOfGallCancel"
) {
  // Resolver messages - broadcast to match room
  // ...
}
```

**Required message types for each resolver:**

- `*Begin` - Initiates the resolver UI for all clients
- `*Select` - (if applicable) Selection updates
- `*Resolve` - Final resolution with card data for cross-player updates
- `*Cancel` - Cancellation cleanup

**Without this registration, cross-player synchronization will fail silently!**

### Pitfall 7: Auto-Resolve Confirmation (Silence & Skip Support)

**Problem:** Cards with automatic effects (Genesis abilities, on-play triggers) may be silenced or the player may want to skip the effect for tactical reasons. Without a confirmation step, the effect fires automatically with no way to decline.

**Solution:** Add a `"confirming"` phase that shows a dialog before executing the effect:

```typescript
// In state file, add "confirming" to your phase type:
export type MyResolverPhase =
  | "confirming" // User confirms whether to auto-resolve
  | "selecting" // Main resolver UI
  | "resolving"
  | "complete";

// In beginMyResolver(), start in confirming phase:
set({
  pendingMyResolver: {
    ...data,
    phase: "confirming",
  },
});

// Add confirmMyResolver() to transition to the main phase:
confirmMyResolver: () => {
  const pending = get().pendingMyResolver;
  if (!pending || pending.phase !== "confirming") return;

  set({
    pendingMyResolver: { ...pending, phase: "selecting" },
  });

  // Broadcast confirmation
  transport.sendMessage({ type: "myResolverConfirm", ... });
},
```

**In the overlay, show confirmation dialog:**

```tsx
{
  phase === "confirming" && isCaster && (
    <div className="confirmation-dialog">
      <h2>Card Name</h2>
      <p>Effect description</p>
      <p className="text-yellow-400">
        Decline if silenced or you want to skip the effect.
      </p>
      <button onClick={cancel}>Decline (Skip)</button>
      <button onClick={confirm}>Auto-Resolve</button>
    </div>
  );
}
```

**Cards that NEED this pattern:**

- **Legion of Gall** - Genesis: banish from collection (may be silenced)
- **Raise Dead** - already has this pattern
- **Omphalos** - end of turn draw (uses `autoResolveState.ts`)
- **Morgana** - Genesis draw (uses `autoResolveState.ts`)
- **Pith Imp** - Genesis steal (uses `autoResolveState.ts`)
- Any card with Genesis, Ordain, or automatic triggers

**Message types to register:** Add `*Confirm` to the server broadcast list alongside Begin/Select/Resolve/Cancel.

---

## Zone Manipulation Checklist

When implementing zone manipulation:

- [ ] Create new arrays with spread operator `[...zones[seat].zone]`
- [ ] Modify the copies, not the originals
- [ ] Build COMPLETE zone object with all seven zones
- [ ] Update local state with `set({ zones: zonesNext })`
- [ ] **For OWN seat:** Send patch with `get().trySendPatch({ zones: { [seat]: targetZones } })`
- [ ] **For OPPONENT seat:** Use custom messages, NOT zone patches (server blocks cross-player patches!)
- [ ] Include full card data in custom messages so opponent can update their zones
- [ ] **CRITICAL:** After opponent updates their zones locally from a custom message, they MUST call `trySendPatch()` to persist changes to the server (updating their OWN seat is allowed)
- [ ] **Register ALL message types in `server/index.ts`** (Begin, Select, Resolve, Cancel)
- [ ] When removing multiple items by index, sort descending first
- [ ] Test in both hotseat and online modes
- [ ] Verify opponent sees correct state after resolution

---

### Summoning Permanents

```typescript
const permanents = get().permanents;
const arr = [...(permanents[location] || [])];
arr.push({
  owner: ownerNum as 1 | 2,
  card: cardToSummon,
  tapped: false,
  instanceId: `summon_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
});
const permanentsNext = { ...permanents, [location]: arr };
set({ permanents: permanentsNext });
get().trySendPatch({ permanents: permanentsNext });
```

### Moving Spell to Graveyard

```typescript
get().movePermanentToZone(spell.at, spell.index, "graveyard");
```

---

## Existing Resolvers Reference

| Card              | State File                 | Overlay                       | Message Types                 | Notes                         |
| ----------------- | -------------------------- | ----------------------------- | ----------------------------- | ----------------------------- |
| Browse            | `browseState.ts`           | `BrowseOverlay.tsx`           | browseBegin, browseResolve    | Search top 5 spells           |
| Common Sense      | `commonSenseState.ts`      | `CommonSenseOverlay.tsx`      | commonSenseBegin, etc.        | Search spellbook for spell    |
| Dhol Chants       | `dholChantsState.ts`       | `DholChantsOverlay.tsx`       | dholChantsBegin, etc.         | Tap allies for damage         |
| Demonic Contract  | `demonicContractState.ts`  | `DemonicContractOverlay.tsx`  | demonicContractBegin, etc.    | Search with rarity limit      |
| Highland Princess | `highlandPrincessState.ts` | `HighlandPrincessOverlay.tsx` | highlandPrincessGenesis, etc. | Search for artifact ≤1        |
| Legion of Gall    | `legionOfGallState.ts`     | `LegionOfGallOverlay.tsx`     | legionOfGallBegin, etc.       | Inspect opponent's collection |
| Raise Dead        | `raiseDeadState.ts`        | `RaiseDeadOverlay.tsx`        | raiseDeadBegin, etc.          | Summon random dead minion     |

Use these as reference implementations.

---

## Recent Example: Legion of Gall

**Card Effect:** "Genesis → Look at a collection and banish three cards from it."

**Implementation highlights:**

- Reuses toolbox inspect hand permissions for opponent's collection
- Allows selection of up to 3 cards
- Banishes selected cards to opponent's banished zone
- Full zone patches prevent data loss

**Files:**

- State: `src/lib/game/store/legionOfGallState.ts`
- Overlay: `src/components/game/LegionOfGallOverlay.tsx`
- Types: Added to `src/lib/game/store/types.ts` (~line 969)
- Trigger: `src/lib/game/store/gameActions/playActions.ts` (~line 848)
- Handlers: `src/lib/game/store/customMessageHandlers.ts` (~line 3112)
- Store: Integrated in `src/lib/game/store.ts` (line 187, line 302)
