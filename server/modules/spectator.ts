"use strict";

import type { Server as SocketIOServer } from "socket.io";
import type { AnyRecord } from "../types";

export function sanitizeMatchInfoForSpectator(info: AnyRecord): AnyRecord {
  try {
    const out: AnyRecord = { ...info };
    delete (out as AnyRecord).playerDecks;
    delete (out as AnyRecord).sealedPacks;
    delete (out as AnyRecord).deckSubmissions;
    delete (out as AnyRecord).draftState;
    return out;
  } catch {
    return info;
  }
}

// Create a face-down card placeholder that the client will accept
// Uses cardId: 0 as a sentinel value for hidden cards
function createFaceDownPlaceholder(index: number): AnyRecord {
  return {
    cardId: 0,
    faceDown: true,
    instanceId: `hidden-${Date.now()}-${index}`,
    name: "",
  };
}

// Sanitize a single player's zones for spectators:
// - Hide hand card details (show as face-down placeholders with just count)
// - Hide deck contents (spellbook/atlas) but keep count
// - Keep graveyard, banished, collection visible (they're public/face-up)
function sanitizePlayerZones(
  zones: AnyRecord | undefined
): AnyRecord | undefined {
  if (!zones || typeof zones !== "object") return undefined;
  const out: AnyRecord = { ...zones };
  // Hand: replace with face-down placeholders (preserve count, hide card data)
  if (Array.isArray(out.hand)) {
    out.hand = out.hand.map((_, i) => createFaceDownPlaceholder(i));
  }
  // Spellbook/Atlas: replace with face-down placeholders (preserve count)
  if (Array.isArray(out.spellbook)) {
    out.spellbook = out.spellbook.map((_, i) => createFaceDownPlaceholder(i));
  }
  if (Array.isArray(out.atlas)) {
    out.atlas = out.atlas.map((_, i) => createFaceDownPlaceholder(i));
  }
  // Graveyard, banished, collection, battlefield are public - keep as-is
  return out;
}

export function sanitizeGameForSpectator(
  game: AnyRecord | null | undefined
): AnyRecord | null {
  if (!game || typeof game !== "object") return null;
  try {
    const out: AnyRecord = { ...game };
    const zones = (out as AnyRecord).zones;
    // Sanitize zones instead of deleting them entirely
    if (zones && typeof zones === "object") {
      out.zones = {
        p1: sanitizePlayerZones(
          (zones as AnyRecord).p1 as AnyRecord | undefined
        ),
        p2: sanitizePlayerZones(
          (zones as AnyRecord).p2 as AnyRecord | undefined
        ),
      };
    }
    return out;
  } catch {
    return null;
  }
}

export async function broadcastSpectatorsUpdated(
  io: SocketIOServer,
  matchId: string
): Promise<void> {
  try {
    const room = `spectate:${matchId}`;
    let count = 0;
    try {
      const sockets = await io.in(room).allSockets();
      count = sockets ? sockets.size : 0;
    } catch (socketErr) {
      console.warn(
        "[spectate] Failed to get sockets for room:",
        room,
        socketErr
      );
    }
    const out = { type: "spectatorsUpdated", matchId, count };
    try {
      io.to(room).emit("message", out);
    } catch (emitErr) {
      console.warn(
        "[spectate] Failed to emit to spectator room:",
        room,
        emitErr
      );
    }
    try {
      io.to(`match:${matchId}`).emit("message", out);
    } catch (emitErr) {
      console.warn(
        "[spectate] Failed to emit to match room:",
        matchId,
        emitErr
      );
    }
  } catch (err) {
    console.warn("[spectate] broadcastSpectatorsUpdated failed:", matchId, err);
  }
}
