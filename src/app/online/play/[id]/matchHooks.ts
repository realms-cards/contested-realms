import { useEffect, useMemo } from "react";
import {
  useGameStore,
  type PlayerKey,
  type RemoteCursorState,
} from "@/lib/game/store";
import type { RemoteCursorDragMeta } from "@/lib/game/store/remoteCursor";
import type { GameTransport } from "@/lib/net/transport";
import { batchSocketUpdate } from "@/lib/utils/batchSocketUpdate";

type MatchPlayer = {
  id: string;
  displayName?: string | null;
  seat?: PlayerKey | null;
};
type MatchLike = {
  playerIds?: string[] | null;
  players?: MatchPlayer[] | null;
};

type SessionLike = { id?: string | null } | null | undefined;

type MessageTransport = GameTransport | null;

export function usePlayerIdentity(
  match: MatchLike | null,
  session: SessionLike
) {
  const myPlayerId = (session?.id as string | undefined) || null;

  const fallbackOrder = useMemo(() => {
    const pids = Array.isArray(match?.playerIds)
      ? (match?.playerIds as string[])
      : null;
    if (pids && pids.length > 0) {
      return pids.filter(Boolean);
    }
    const players = Array.isArray(match?.players) ? match?.players : null;
    if (players) {
      return players.map((p) => p?.id).filter(Boolean) as string[];
    }
    return [] as string[];
  }, [match?.playerIds, match?.players]);

  const seatAssignments = useMemo(() => {
    const map = new Map<string, PlayerKey>();
    const players = Array.isArray(match?.players) ? match.players : null;
    if (players) {
      for (const player of players) {
        if (!player || typeof player !== "object") continue;
        const pid = player.id;
        const seat = (player as { seat?: PlayerKey | null }).seat;
        if (pid && (seat === "p1" || seat === "p2")) {
          map.set(pid, seat);
        }
      }
    }
    if (map.size < 2) {
      for (let i = 0; i < fallbackOrder.length && i < 2; i++) {
        const pid = fallbackOrder[i];
        if (pid && !map.has(pid)) {
          map.set(pid, i === 0 ? "p1" : "p2");
        }
      }
    }
    return map;
  }, [match?.players, fallbackOrder]);

  const orderedPlayerIds = fallbackOrder;

  const myPlayerIndex = useMemo(() => {
    if (!myPlayerId) return -1;
    return orderedPlayerIds.indexOf(myPlayerId);
  }, [orderedPlayerIds, myPlayerId]);

  const myPlayerKey: PlayerKey | null = myPlayerId
    ? seatAssignments.get(myPlayerId) ?? null
    : null;
  const myPlayerNumber =
    myPlayerKey != null
      ? myPlayerKey === "p1"
        ? 1
        : 2
      : myPlayerIndex >= 0
      ? myPlayerIndex + 1
      : null;

  const opponentSeat: PlayerKey | null = useMemo(() => {
    if (!myPlayerKey) return null;
    return myPlayerKey === "p1" ? "p2" : "p1";
  }, [myPlayerKey]);

  const opponentPlayerId: string | null = useMemo(() => {
    if (!opponentSeat) return null;
    for (const [pid, seat] of seatAssignments.entries()) {
      if (seat === opponentSeat) return pid;
    }
    if (myPlayerIndex < 0) return null;
    if (orderedPlayerIds.length < 2) return null;
    const fallbackIndex = myPlayerIndex === 0 ? 1 : 0;
    return orderedPlayerIds[fallbackIndex] || null;
  }, [opponentSeat, seatAssignments, myPlayerIndex, orderedPlayerIds]);

  return {
    myPlayerId,
    orderedPlayerIds,
    myPlayerIndex,
    myPlayerNumber,
    myPlayerKey,
    opponentSeat,
    opponentPlayerId,
  };
}

export function useMatchPlayerNames(match: MatchLike | null) {
  return useMemo(() => {
    const names: { p1: string; p2: string } = {
      p1: "Player 1",
      p2: "Player 2",
    };

    if (Array.isArray(match?.players)) {
      if (match?.players?.[0]) {
        names.p1 = match.players[0]?.displayName || "Player 1";
      }
      if (match?.players?.[1]) {
        names.p2 = match.players[1]?.displayName || "Player 2";
      }
    }

    return names;
  }, [match?.players]);
}

export function usePlayerNameMap(match: MatchLike | null) {
  return useMemo(() => {
    const map: Record<string, string> = {};
    if (!Array.isArray(match?.players)) return map;
    for (const p of match.players) {
      if (!p || typeof p !== "object") continue;
      const id = p.id;
      if (!id) continue;
      map[id] = p.displayName || id;
    }
    return map;
  }, [match?.players]);
}

function parseDragging(raw: unknown): RemoteCursorDragMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const kind = d.kind;
  if (kind === "permanent") {
    const meta: RemoteCursorDragMeta = { kind: "permanent" };
    if (typeof d.from === "string") meta.from = d.from;
    if (Number.isFinite(d.index)) meta.index = Number(d.index);
    return meta;
  }
  if (kind === "hand") return { kind: "hand" };
  if (kind === "token") return { kind: "token" };
  if (kind === "pile") {
    const meta: RemoteCursorDragMeta = { kind: "pile" };
    if (typeof d.source === "string") meta.source = d.source;
    return meta;
  }
  if (kind === "avatar") {
    const meta: RemoteCursorDragMeta = { kind: "avatar" };
    if (d.who === "p1" || d.who === "p2") meta.who = d.who;
    return meta;
  }
  return null;
}

function parseHighlight(
  raw: unknown
): { slug: string | null; cardId: number | null } | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const slug = typeof src.slug === "string" ? src.slug : null;
  const cardId =
    typeof src.cardId === "number" && Number.isFinite(src.cardId)
      ? (src.cardId as number)
      : null;
  if (slug === null && cardId === null) return null;
  return { slug, cardId };
}

export function useRemoteCursorTelemetry(transport: MessageTransport | null) {
  const localPlayerId = useGameStore((s) => s.localPlayerId);
  const setRemoteCursor = useGameStore((s) => s.setRemoteCursor);

  useEffect(() => {
    if (!transport?.on) return;

    const handler = (raw: unknown) => {
      if (!raw || typeof raw !== "object") return;
      const payload = raw as RemoteCursorState;
      const pid =
        typeof payload.playerId === "string" ? payload.playerId : null;
      if (!pid || pid === localPlayerId) return;
      const px = payload.position?.x;
      const pz = payload.position?.z;
      const position =
        typeof px === "number" &&
        Number.isFinite(px) &&
        typeof pz === "number" &&
        Number.isFinite(pz)
          ? { x: px, z: pz }
          : null;
      const dragging = parseDragging(payload.dragging);
      const highlight = parseHighlight(payload.highlight);
      const ts = Number.isFinite(payload.ts) ? Number(payload.ts) : Date.now();

      // Wrap in startTransition for React 19 concurrent rendering compatibility
      // Marks cursor updates as non-urgent to prevent blocking interactive input
      batchSocketUpdate(() => {
        setRemoteCursor({
          playerId: pid,
          playerKey:
            payload.playerKey === "p1" || payload.playerKey === "p2"
              ? payload.playerKey
              : null,
          position,
          dragging,
          highlight,
          ts,
          displayName: null,
        });
      });
    };

    const off = transport.on("boardCursor", handler);
    return () => {
      try {
        off?.();
      } catch {}
    };
  }, [transport, localPlayerId, setRemoteCursor]);
}

export function useChaosTwisterListener(transport: MessageTransport | null) {
  const receiveCustomMessage = useGameStore((s) => s.receiveCustomMessage);

  useEffect(() => {
    if (!transport?.on) return;
    const off = transport.on("message", (m) => {
      const type =
        m && typeof m === "object" && (m as Record<string, unknown>).type;
      // Route Chaos Twister messages to the custom message handler
      if (
        type === "chaosTwisterBegin" ||
        type === "chaosTwisterSelectMinion" ||
        type === "chaosTwisterSelectSite" ||
        type === "chaosTwisterMinigameResult" ||
        type === "chaosTwisterResolve" ||
        type === "chaosTwisterCancel" ||
        type === "chaosTwisterSliderPosition"
      ) {
        // Log non-position messages for debugging
        if (type !== "chaosTwisterSliderPosition") {
          console.log(`[ChaosTwister] Received: ${type}`, m);
        }
        batchSocketUpdate(() => {
          receiveCustomMessage(m);
        });
        return;
      }
    });
    return () => {
      try {
        off?.();
      } catch {}
    };
  }, [transport, receiveCustomMessage]);
}

export function useBoardPingListener(transport: MessageTransport | null) {
  useEffect(() => {
    if (!transport?.on) return;
    const off = transport.on("message", (m) => {
      const type =
        m && typeof m === "object" && (m as Record<string, unknown>).type;
      if (type !== "boardPing") return;
      const msg = m as unknown as {
        id?: string;
        position?: { x?: number; z?: number };
        playerKey?: PlayerKey | null;
        ts?: number;
      };
      const id =
        typeof msg.id === "string"
          ? msg.id
          : `ping_${Math.random()
              .toString(36)
              .slice(2, 8)}_${Date.now().toString(36)}`;
      const x = Number(msg.position?.x);
      const z = Number(msg.position?.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;

      // Wrap in startTransition for React 19 concurrent rendering compatibility
      // Board pings are visual effects and can be treated as non-urgent
      batchSocketUpdate(() => {
        useGameStore.getState().pushBoardPing({
          id,
          position: { x, z },
          playerId: null,
          playerKey:
            msg.playerKey === "p1" || msg.playerKey === "p2"
              ? msg.playerKey
              : null,
          ts: typeof msg.ts === "number" ? msg.ts : Date.now(),
        });
      });
    });
    return () => {
      try {
        off?.();
      } catch {}
    };
  }, [transport]);
}
