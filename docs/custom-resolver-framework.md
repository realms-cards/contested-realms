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

1. Import the slice:

```typescript
import { create<CardName>Slice } from "./store/<cardName>State";
```

2. Add to store creation (~line 165):

```typescript
...create<CardName>Slice(setState, getState, store),
```

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
- [ ] Add types to `types.ts`
- [ ] Create overlay component using `CardWithPreview`
- [ ] Add card detection and routing in `playActions.ts`
- [ ] Add message handlers in `customMessageHandlers.ts`
- [ ] Import and spread slice in `store.ts`
- [ ] Add overlay to both play pages
- [ ] Test hotseat mode (both players see correct UI)
- [ ] Test online mode (caster controls, opponent sees status)

---

## Common Patterns

### Zone Manipulation

```typescript
// Remove from top of spellbook
const spellbook = [...zones[seat].spellbook];
const revealed = spellbook.splice(0, count);

// Add to bottom of spellbook
spellbook.push(...cards);

// Add to hand
const hand = [...zones[seat].hand, card];

// Update zones and send patch
const zonesNext = { ...zones, [seat]: { ...zones[seat], spellbook, hand } };
set({ zones: zonesNext });
get().trySendPatch({ zones: { [seat]: zonesNext[seat] } });
```

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

| Card              | State File                 | Overlay                       | Message Types                 |
| ----------------- | -------------------------- | ----------------------------- | ----------------------------- |
| Browse            | `browseState.ts`           | `BrowseOverlay.tsx`           | browseBegin, browseResolve    |
| Common Sense      | `commonSenseState.ts`      | `CommonSenseOverlay.tsx`      | commonSenseBegin, etc.        |
| Dhol Chants       | `dholChantsState.ts`       | `DholChantsOverlay.tsx`       | dholChantsBegin, etc.         |
| Demonic Contract  | `demonicContractState.ts`  | `DemonicContractOverlay.tsx`  | demonicContractBegin, etc.    |
| Highland Princess | `highlandPrincessState.ts` | `HighlandPrincessOverlay.tsx` | highlandPrincessGenesis, etc. |

Use these as reference implementations.
