import type { StateCreator } from "zustand";
import { PLAYER_COLORS } from "@/lib/game/constants";
import type { GameState, RemoteCursorState } from "./types";

type HighlightCard = Parameters<
  GameState["getRemoteHighlightColor"]
>[0];
type HighlightOptions = Parameters<
  GameState["getRemoteHighlightColor"]
>[1];

export type RemoteCursorSlice = Pick<
  GameState,
  | "remoteCursors"
  | "setRemoteCursor"
  | "pruneRemoteCursors"
  | "getRemoteHighlightColor"
>;

export const createRemoteCursorSlice: StateCreator<
  GameState,
  [],
  [],
  RemoteCursorSlice
> = (set, get) => ({
  remoteCursors: {},

  setRemoteCursor: (cursor) =>
    set((state) => {
      try {
        const id = String(cursor.playerId || "").trim();
        if (!id) return state as GameState;
        const prev = state.remoteCursors[id] || null;
        const ts = Number.isFinite(cursor.ts) ? Number(cursor.ts) : Date.now();
        if (prev && Number(prev.ts) >= ts) return state as GameState;
        const noPresence =
          !cursor.position && !cursor.dragging && !cursor.highlight;
        if (noPresence) {
          if (!(id in state.remoteCursors)) return state as GameState;
          const next = { ...state.remoteCursors };
          delete next[id];
          return { remoteCursors: next } as Partial<GameState> as GameState;
        }
        const nextHighlight =
          cursor.highlight === undefined
            ? prev?.highlight ?? null
            : cursor.highlight;

        const nextEntry: RemoteCursorState = {
          playerId: id,
          playerKey:
            cursor.playerKey === "p1" || cursor.playerKey === "p2"
              ? cursor.playerKey
              : prev?.playerKey ?? null,
          position: cursor.position ?? null,
          dragging: cursor.dragging ?? null,
          highlight: nextHighlight,
          ts,
          displayName: null,
          prevPosition: prev?.position ?? null,
          prevTs: prev?.ts ?? ts,
        };
        return {
          remoteCursors: {
            ...state.remoteCursors,
            [id]: nextEntry,
          },
        } as Partial<GameState> as GameState;
      } catch {
        return state as GameState;
      }
    }),

  pruneRemoteCursors: (olderThanMs) =>
    set((state) => {
      const cutoff = Date.now() - olderThanMs;
      const next: Record<string, RemoteCursorState> = {};
      let changed = false;
      for (const [id, entry] of Object.entries(state.remoteCursors || {})) {
        if (!entry || Number(entry.ts) < cutoff) {
          changed = true;
          continue;
        }
        next[id] = entry;
      }
      if (!changed) return state as GameState;
      return { remoteCursors: next } as Partial<GameState> as GameState;
    }),

  getRemoteHighlightColor: (card: HighlightCard, options?: HighlightOptions) => {
    if (!card) return null;
    const state = get();
    const slug =
      typeof card.slug === "string" && card.slug.length > 0 ? card.slug : null;
    const cardId = Number.isFinite(card.cardId) ? Number(card.cardId) : null;
    const instanceKey = options?.instanceKey ?? null;
    if (cardId === null && slug === null && instanceKey === null) return null;
    for (const entry of Object.values(state.remoteCursors || {})) {
      if (!entry?.highlight) continue;
      const {
        cardId: highlightId,
        slug: highlightSlug,
        instanceKey: highlightInstanceKey,
      } = entry.highlight;
      const instanceMatches =
        instanceKey !== null &&
        typeof highlightInstanceKey === "string" &&
        highlightInstanceKey === instanceKey;
      const allowFallback =
        instanceKey === null || highlightInstanceKey === null;
      let matchesId = false;
      let matchesSlug = false;
      if (allowFallback) {
        matchesId =
          cardId !== null &&
          Number.isFinite(highlightId) &&
          Number(highlightId) === cardId;
        matchesSlug =
          slug !== null &&
          typeof highlightSlug === "string" &&
          highlightSlug === slug;
      }
      if (!instanceMatches && !matchesId && !matchesSlug) continue;
      if (entry.playerKey === "p1") return PLAYER_COLORS.p1;
      if (entry.playerKey === "p2") return PLAYER_COLORS.p2;
      return PLAYER_COLORS.spectator;
    }
    return null;
  },
});
