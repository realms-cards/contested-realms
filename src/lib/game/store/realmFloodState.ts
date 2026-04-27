import type { StateCreator } from "zustand";
import {
  newTokenInstanceId,
  TOKEN_BY_NAME,
  tokenSlug,
} from "@/lib/game/tokens";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CellKey,
  GameState,
  PermanentItem,
  PlayerKey,
  ServerPatchT,
} from "./types";
import { prepareCardForSeat } from "./utils/cardHelpers";
import { newPermanentInstanceId } from "./utils/idHelpers";
import { randomTilt } from "./utils/permanentHelpers";

function newRealmFloodId() {
  return `realm_flood_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

function hasFloodedToken(items: PermanentItem[] | undefined): boolean {
  if (!Array.isArray(items)) return false;
  return items.some(
    (item) => String(item.card?.name || "").toLowerCase() === "flooded",
  );
}

export function ensureFloodedTokenAtSite(
  items: PermanentItem[] | undefined,
  owner: 1 | 2,
): PermanentItem[] {
  const current = Array.isArray(items) ? items : [];
  if (hasFloodedToken(current)) return current;
  const floodedDef = TOKEN_BY_NAME.flooded;
  if (!floodedDef) return current;
  const ownerSeat: PlayerKey = owner === 1 ? "p1" : "p2";
  const floodedCard = prepareCardForSeat(
    {
      cardId: newTokenInstanceId(floodedDef),
      variantId: null,
      name: floodedDef.name,
      type: "Token",
      slug: tokenSlug(floodedDef),
      thresholds: null,
    },
    ownerSeat,
  );
  return [
    ...current,
    {
      owner,
      card: floodedCard,
      offset: null,
      tilt: randomTilt(),
      tapVersion: 0,
      tapped: false,
      version: 0,
      instanceId: floodedCard.instanceId ?? newPermanentInstanceId(),
    },
  ];
}

function buildRealmFloodPermanents(state: GameState): {
  permanentsNext: GameState["permanents"];
  permanentsPatch: ServerPatchT["permanents"] | undefined;
} {
  let permanentsNext = state.permanents;
  let permanentsPatch: NonNullable<ServerPatchT["permanents"]> | undefined;
  for (const [cellKey, site] of Object.entries(state.board.sites ?? {})) {
    if (!site) continue;
    const typedCellKey = cellKey as CellKey;
    const current = permanentsNext[typedCellKey];
    const updated = ensureFloodedTokenAtSite(current, site.owner);
    if (updated === current) continue;
    if (permanentsNext === state.permanents) {
      permanentsNext = { ...state.permanents };
    }
    permanentsNext[typedCellKey] = updated;
    permanentsPatch = {
      ...(permanentsPatch || {}),
      [typedCellKey]: updated,
    } as NonNullable<ServerPatchT["permanents"]>;
  }
  return { permanentsNext, permanentsPatch };
}

export type RealmFloodSlice = Pick<
  GameState,
  "pendingRealmFlood" | "beginRealmFlood" | "resolveRealmFlood"
>;

export const createRealmFloodSlice: StateCreator<
  GameState,
  [],
  [],
  RealmFloodSlice
> = (set, get) => ({
  pendingRealmFlood: null,

  beginRealmFlood: (input) => {
    const pending = {
      id: newRealmFloodId(),
      source: input.source,
      casterSeat: input.casterSeat,
      phase: "resolving" as const,
      createdAt: Date.now(),
    };

    set({ pendingRealmFlood: pending } as Partial<GameState> as GameState);

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "realmFloodBegin",
          id: pending.id,
          source: pending.source,
          casterSeat: pending.casterSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    setTimeout(() => {
      get().resolveRealmFlood();
    }, 0);
  },

  resolveRealmFlood: () => {
    const pending = get().pendingRealmFlood;
    if (!pending) return;

    const state = get();
    const nextSpecialSiteState = state.specialSiteState.realmFlooded
      ? state.specialSiteState
      : {
          ...state.specialSiteState,
          realmFlooded: true,
        };
    const { permanentsNext, permanentsPatch } =
      buildRealmFloodPermanents(state);

    set({
      pendingRealmFlood: null,
      ...(nextSpecialSiteState !== state.specialSiteState
        ? { specialSiteState: nextSpecialSiteState }
        : {}),
      ...(permanentsNext !== state.permanents
        ? { permanents: permanentsNext }
        : {}),
    } as Partial<GameState> as GameState);

    const patch: ServerPatchT = {
      ...(nextSpecialSiteState !== state.specialSiteState
        ? { specialSiteState: nextSpecialSiteState }
        : {}),
      ...(permanentsPatch ? { permanents: permanentsPatch } : {}),
    };
    if (Object.keys(patch).length > 0) {
      get().trySendPatch(patch);
    }

    const sourceName = String(pending.source.card?.name || "This effect");
    get().log(
      `[${pending.casterSeat.toUpperCase()}] ${sourceName} permanently floods the entire realm`,
    );

    if (sourceName.toLowerCase() === "the flood") {
      try {
        get().movePermanentToZone(
          pending.source.at,
          pending.source.index,
          "graveyard",
        );
      } catch {}
    }

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "realmFloodResolve",
          id: pending.id,
          casterSeat: pending.casterSeat,
          sourceName,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },
});
