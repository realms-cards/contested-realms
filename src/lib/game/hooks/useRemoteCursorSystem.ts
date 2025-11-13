import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import type { StoreApi, UseBoundStore } from "zustand";
import { PLAYER_COLORS, TILE_SIZE, CARD_SHORT, CARD_LONG } from "@/lib/game/constants";
import { TOKEN_BY_NAME, TOKEN_BY_KEY, tokenTextureUrl } from "@/lib/game/tokens";
import type {
  BoardState,
  CardRef,
  GameState,
  Permanents,
  PlayerKey,
} from "@/lib/game/store/types";
import type {
  RemoteCursorDragMeta,
  RemoteCursorHighlight,
  RemoteCursorState,
} from "@/lib/game/store/remoteCursor";

export type RemotePermanentDrag = {
  key: string;
  pos: { x: number; z: number };
  rotZ: number;
  slug: string;
  color: string;
  width: number;
  height: number;
  textureUrl?: string;
  forceTextureUrl?: boolean;
  textureRotation?: number;
};

export type RemoteHandDrag = {
  key: string;
  pos: { x: number; z: number };
  rotZ: number;
  color: string;
};

export type RemoteAvatarDrag = {
  key: string;
  pos: { x: number; z: number };
  rotZ: number;
  slug: string;
  color: string;
};

type UseRemoteCursorSystemOptions = {
  resolvedStoreApi: UseBoundStore<StoreApi<GameState>>;
  isSpectator: boolean;
  overlayBlocking: boolean;
  remoteCursors: GameState["remoteCursors"];
  localPlayerId: string | null;
  actorKey: GameState["actorKey"];
  permanents: Permanents;
  avatars: GameState["avatars"];
  boardOffset: { x: number; y: number };
  boardSize: BoardState["size"];
  dragAvatar: PlayerKey | null;
  dragging: { from: string; index: number } | null;
  previewCard: GameState["previewCard"];
  selectedCard: GameState["selectedCard"];
  selectedPermanent: GameState["selectedPermanent"];
  handlePointerMoveRef: MutableRefObject<(x: number, z: number) => void>;
  setLastPointerWorldPos: GameState["setLastPointerWorldPos"];
};

type RemoteCursorSystemResult = {
  remotePermanentDrags: RemotePermanentDrag[];
  remotePermanentDragLookup: Map<string, Set<number>>;
  remoteHandDrags: RemoteHandDrag[];
  remoteAvatarDrags: RemoteAvatarDrag[];
  remoteAvatarDragSet: Set<PlayerKey>;
  handlePointerMove: (x: number, z: number) => void;
  emitBoardPing: (position: { x: number; z: number } | null) => void;
  lastPointerRef: MutableRefObject<{ x: number; z: number } | null>;
};

export function useRemoteCursorSystem({
  resolvedStoreApi,
  isSpectator,
  overlayBlocking,
  remoteCursors,
  localPlayerId,
  actorKey,
  permanents,
  avatars,
  boardOffset,
  boardSize,
  dragAvatar,
  dragging,
  previewCard,
  selectedCard,
  selectedPermanent,
  handlePointerMoveRef,
  setLastPointerWorldPos,
}: UseRemoteCursorSystemOptions): RemoteCursorSystemResult {
  const lastCursorRef = useRef<RemoteCursorState | null>(null);
  const lastCursorSentAtRef = useRef<number>(0);
  const lastPointerRef = useRef<{ x: number; z: number } | null>(null);

  const { remotePermanentDrags, remotePermanentDragLookup } = useMemo(() => {
    if (overlayBlocking) {
      return {
        remotePermanentDrags: [] as RemotePermanentDrag[],
        remotePermanentDragLookup: new Map<string, Set<number>>(),
      };
    }
    const drags: RemotePermanentDrag[] = [];
    const lookup = new Map<string, Set<number>>();
    try {
      const rc = remoteCursors || {};
      for (const entry of Object.values(rc)) {
        if (!entry) continue;
        if (!entry.position) continue;
        if (localPlayerId && entry.playerId === localPlayerId) continue;
        const drag = entry.dragging;
        if (!drag || drag.kind !== "permanent") continue;
        const from = String(drag.from || "");
        const index = Number(drag.index ?? -1);
        if (!from || index < 0) continue;
        const list = permanents[from] || [];
        const p = list[index];
        if (!p || !p.card) continue;
        const isToken = ((p.card.type || "") as string)
          .toLowerCase()
          .includes("token");
        const tokenDef = isToken
          ? TOKEN_BY_NAME[(p.card.name || "").toLowerCase()]
          : undefined;
        let w = CARD_SHORT;
        let h = CARD_LONG;
        if (isToken && tokenDef?.size === "small") {
          w = CARD_SHORT * 0.5;
          h = CARD_LONG * 0.5;
        }
        const ownerRot = p.owner === 1 ? 0 : Math.PI;
        const rotZ =
          ownerRot +
          (tokenDef?.siteReplacement ? -Math.PI / 2 : 0) +
          (p.tapped ? Math.PI / 2 : 0) +
          (p.tilt || 0);
        const color =
          entry.playerKey === "p1"
            ? PLAYER_COLORS.p1
            : entry.playerKey === "p2"
            ? PLAYER_COLORS.p2
            : PLAYER_COLORS.spectator;
        const existing = lookup.get(from);
        if (existing) existing.add(index);
        else lookup.set(from, new Set([index]));
        drags.push({
          key: `rdrag:${entry.playerId}:${from}:${index}`,
          pos: { x: entry.position.x, z: entry.position.z },
          rotZ,
          slug: isToken ? "" : p.card.slug || "",
          color,
          width: w,
          height: h,
          textureUrl:
            isToken && tokenDef ? tokenTextureUrl(tokenDef) : undefined,
          forceTextureUrl: Boolean(isToken && tokenDef),
          textureRotation:
            isToken && tokenDef ? tokenDef.textureRotation ?? 0 : 0,
        });
      }
    } catch {}
    return {
      remotePermanentDrags: drags,
      remotePermanentDragLookup: lookup,
    };
  }, [overlayBlocking, remoteCursors, localPlayerId, permanents]);

  const remoteHandDrags = useMemo(() => {
    if (overlayBlocking) {
      return [] as RemoteHandDrag[];
    }
    const drags: RemoteHandDrag[] = [];
    const halfTile = TILE_SIZE * 0.5;
    const boardMinX = boardOffset.x - halfTile;
    const boardMaxX = boardOffset.x + TILE_SIZE * (boardSize.w - 0.5);
    const boardMinZ = boardOffset.y - halfTile;
    const boardMaxZ = boardOffset.y + TILE_SIZE * (boardSize.h - 0.5);
    const boundaryEps = TILE_SIZE * 0.2;
    try {
      const rc = remoteCursors || {};
      for (const entry of Object.values(rc)) {
        if (!entry) continue;
        if (!entry.position) continue;
        if (localPlayerId && entry.playerId === localPlayerId) continue;
        const drag = entry.dragging;
        if (!drag || drag.kind !== "hand") continue;
        const { x, z } = entry.position;
        if (
          x < boardMinX - boundaryEps ||
          x > boardMaxX + boundaryEps ||
          z < boardMinZ - boundaryEps ||
          z > boardMaxZ + boundaryEps
        ) {
          continue;
        }
        const color =
          entry.playerKey === "p1"
            ? PLAYER_COLORS.p1
            : entry.playerKey === "p2"
            ? PLAYER_COLORS.p2
            : PLAYER_COLORS.spectator;
        const rotZ = entry.playerKey === "p2" ? Math.PI : 0;
        drags.push({
          key: `rhand:${entry.playerId ?? "unknown"}`,
          pos: { x, z },
          rotZ,
          color,
        });
      }
    } catch {}
    return drags;
  }, [
    overlayBlocking,
    remoteCursors,
    localPlayerId,
    boardOffset.x,
    boardOffset.y,
    boardSize.w,
    boardSize.h,
  ]);

  const { remoteAvatarDrags, remoteAvatarDragSet } = useMemo(() => {
    if (overlayBlocking) {
      return {
        remoteAvatarDrags: [] as RemoteAvatarDrag[],
        remoteAvatarDragSet: new Set<PlayerKey>(),
      };
    }
    const drags: RemoteAvatarDrag[] = [];
    const dragging = new Set<PlayerKey>();
    try {
      const rc = remoteCursors || {};
      for (const entry of Object.values(rc)) {
        if (!entry) continue;
        if (!entry.position) continue;
        if (localPlayerId && entry.playerId === localPlayerId) continue;
        const drag = entry.dragging;
        if (!drag || drag.kind !== "avatar") continue;
        const who = drag.who;
        if (who !== "p1" && who !== "p2") continue;
        const avatar = avatars?.[who];
        const color =
          entry.playerKey === "p1"
            ? PLAYER_COLORS.p1
            : entry.playerKey === "p2"
            ? PLAYER_COLORS.p2
            : PLAYER_COLORS.spectator;
        const rotZ =
          (who === "p1" ? 0 : Math.PI) + (avatar?.tapped ? Math.PI / 2 : 0);
        const slug = avatar?.card?.slug || "";
        if (!slug) continue;
        dragging.add(who);
        drags.push({
          key: `ravatar:${entry.playerId ?? "unknown"}:${who}`,
          pos: { x: entry.position.x, z: entry.position.z },
          rotZ,
          slug,
          color,
        });
      }
    } catch {}
    return {
      remoteAvatarDrags: drags,
      remoteAvatarDragSet: dragging,
    };
  }, [avatars, overlayBlocking, remoteCursors, localPlayerId]);

  const resolveHighlight = useCallback((): RemoteCursorHighlight => {
    const state = resolvedStoreApi.getState();
    const deriveCardMeta = (
      card: CardRef | null | undefined,
      instanceKey?: string | null
    ) => {
      if (!card) return null;
      const slug =
        typeof card.slug === "string" && card.slug.length > 0
          ? card.slug
          : null;
      const cardId = Number.isFinite(card.cardId) ? Number(card.cardId) : null;
      const type = (card.type || "").toLowerCase();
      const isToken = type.includes("token");
      if (cardId === null && !isToken) {
        if (!slug) return null;
      }
      const baseId =
        cardId ?? -Math.abs(Number(card.variantId ?? Date.now() % 1000));
      const syntheticId = baseId || -1;
      return {
        slug,
        cardId: syntheticId,
        instanceKey: instanceKey ?? null,
      };
    };
    const selCard = state.selectedCard;
    if (state.dragFromHand) {
      if (selCard) {
        const key = `hand:${selCard.who}:${selCard.index}`;
        const meta = deriveCardMeta(selCard.card, key);
        if (meta) return meta;
      }
      const pileCard = state.dragFromPile?.card ?? null;
      if (pileCard) {
        const key = `pile:${state.dragFromPile?.from ?? "unknown"}`;
        const meta = deriveCardMeta(pileCard, key);
        if (meta) return meta;
      }
    } else if (selCard) {
      const key = `hand:${selCard.who}:${selCard.index}`;
      const meta = deriveCardMeta(selCard.card, key);
      if (meta) return meta;
    }
    const selPermanent = state.selectedPermanent;
    if (selPermanent) {
      const at = selPermanent.at;
      const index = selPermanent.index;
      const card = state.permanents?.[at]?.[index]?.card ?? null;
      const meta = deriveCardMeta(card, `perm:${at}:${index}`);
      if (meta) {
        return meta;
      }
    }
    const pileDragCard = state.dragFromPile?.card ?? null;
    const pileDragMeta = deriveCardMeta(
      pileDragCard,
      state.dragFromPile ? `pile:${state.dragFromPile.from ?? "unknown"}` : null
    );
    if (pileDragMeta) return pileDragMeta;
    return null;
  }, [resolvedStoreApi]);

  const resolveDraggingMeta = useCallback((): RemoteCursorDragMeta | null => {
    const s = resolvedStoreApi.getState();
    if (isSpectator) return null;
    if (dragAvatar) {
      return { kind: "avatar", who: dragAvatar };
    }
    const dragFromHandState = s.dragFromHand;
    if (dragFromHandState && s.selectedCard) {
      return { kind: "hand" };
    }
    if (s.dragFromPile?.card) {
      return { kind: "pile", source: s.dragFromPile.from };
    }
    if (dragging) {
      return {
        kind: "permanent",
        from: dragging.from,
        index: dragging.index,
      };
    }
    return null;
  }, [dragAvatar, dragging, isSpectator, resolvedStoreApi]);

  const round3 = (n: number) =>
    Number.isFinite(n) ? Number(n.toFixed(3)) : 0;

  const positionsEqual = (
    a: RemoteCursorState["position"],
    b: RemoteCursorState["position"]
  ) => {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.x === b.x && a.z === b.z;
  };

  const draggingEquals = (
    a: RemoteCursorDragMeta | null,
    b: RemoteCursorDragMeta | null
  ) => {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.kind !== b.kind) return false;
    switch (a.kind) {
      case "permanent":
        return (
          b.kind === "permanent" && a.from === b.from && a.index === b.index
        );
      case "hand":
        return b.kind === "hand";
      case "pile":
        return b.kind === "pile" && a.source === b.source;
      case "token":
        return b.kind === "token";
      case "avatar":
        return b.kind === "avatar" && a.who === b.who;
      default:
        return false;
    }
  };

  const sendCursor = useCallback(
    (position: { x: number; z: number } | null) => {
      if (isSpectator) return;
      const s = resolvedStoreApi.getState();
      const playerId = s.localPlayerId;
      if (!playerId) return;
      const tr = s.transport;
      if (!tr?.sendMessage) return;
      const highlight = resolveHighlight();
      const payload: RemoteCursorState = {
        playerId,
        playerKey: s.actorKey,
        position: position
          ? { x: round3(position.x), z: round3(position.z) }
          : null,
        dragging: resolveDraggingMeta(),
        highlight,
        ts: Date.now(),
        displayName: undefined,
      };
      const prev = lastCursorRef.current;
      const now = Date.now();
      const minInterval =
        typeof process.env.NEXT_PUBLIC_CURSOR_MS === "string"
          ? parseInt(process.env.NEXT_PUBLIC_CURSOR_MS, 10)
          : 66;
      if (
        prev &&
        positionsEqual(prev.position, payload.position) &&
        draggingEquals(prev.dragging, payload.dragging) &&
        (prev.highlight?.slug || null) === (payload.highlight?.slug || null) &&
        (prev.highlight?.cardId || null) ===
          (payload.highlight?.cardId || null) &&
        (prev.highlight?.instanceKey || null) ===
          (payload.highlight?.instanceKey || null)
      ) {
        lastCursorRef.current = { ...payload };
        return;
      }
      if (now - lastCursorSentAtRef.current < minInterval) {
        lastCursorRef.current = { ...payload };
        return;
      }
      lastCursorRef.current = { ...payload };
      lastCursorSentAtRef.current = now;
      try {
        tr.sendMessage({ type: "boardCursor", ...payload });
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[cursor] send failed", err);
        }
      }
    },
    [isSpectator, resolveDraggingMeta, resolveHighlight, resolvedStoreApi]
  );

  const handlePointerMove = useCallback(
    (x: number, z: number) => {
      const position = { x, z };
      setLastPointerWorldPos(position);
      lastPointerRef.current = position;
      if (!isSpectator) {
        sendCursor(position);
      }
    },
    [isSpectator, sendCursor, setLastPointerWorldPos]
  );

  const handlePointerOut = useCallback(() => {
    setLastPointerWorldPos(null);
    lastPointerRef.current = null;
    if (!isSpectator) {
      sendCursor(null);
    }
  }, [isSpectator, sendCursor, setLastPointerWorldPos]);

  useEffect(() => {
    handlePointerMoveRef.current = handlePointerMove;
  }, [handlePointerMove, handlePointerMoveRef]);

  useEffect(() => {
    sendCursor(lastPointerRef.current ?? null);
  }, [
    actorKey,
    dragAvatar,
    dragging,
    previewCard,
    selectedCard,
    selectedPermanent,
    sendCursor,
  ]);

  useEffect(() => {
    if (overlayBlocking) {
      handlePointerOut();
    }
  }, [overlayBlocking, handlePointerOut]);

  useEffect(() => {
    const handleLeave = () => handlePointerOut();
    const handleBlur = () => handlePointerOut();
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") {
        handlePointerOut();
      }
    };
    window.addEventListener("pointerleave", handleLeave);
    window.addEventListener("pointercancel", handleLeave);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("pointerleave", handleLeave);
      window.removeEventListener("pointercancel", handleLeave);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [handlePointerOut]);

  const emitBoardPing = useCallback(
    (position: { x: number; z: number } | null) => {
      if (!position || isSpectator) return;
      const x = Number(position.x);
      const z = Number(position.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      const { actorKey, pushBoardPing, transport } =
        resolvedStoreApi.getState();
      const seat = actorKey === "p1" || actorKey === "p2" ? actorKey : "p1";
      const id = `ping_${Math.random()
        .toString(36)
        .slice(2, 8)}_${Date.now().toString(36)}`;
      const ts = Date.now();
      try {
        pushBoardPing({
          id,
          position: { x, z },
          playerId: null,
          playerKey: seat,
          ts,
        });
      } catch {}
      try {
        transport?.sendMessage?.({
          type: "boardPing",
          id,
          position: { x, z },
          playerKey: seat,
          ts,
        });
      } catch {}
    },
    [isSpectator, resolvedStoreApi]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "Space" || e.key === " " || e.key === "Spacebar") {
        const ae = (document.activeElement as HTMLElement | null) || null;
        if (
          ae &&
          (ae.tagName === "INPUT" ||
            ae.tagName === "TEXTAREA" ||
            ae.isContentEditable)
        ) {
          return;
        }
        if (isSpectator) return;
        e.preventDefault();
        const { lastPointerWorldPos } = resolvedStoreApi.getState();
        emitBoardPing(lastPointerWorldPos);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [emitBoardPing, isSpectator, resolvedStoreApi]);

  return {
    remotePermanentDrags,
    remotePermanentDragLookup,
    remoteHandDrags,
    remoteAvatarDrags,
    remoteAvatarDragSet,
    handlePointerMove,
    emitBoardPing,
    lastPointerRef,
  };
}
