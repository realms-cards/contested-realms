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

export function sanitizeGameForSpectator(
  game: AnyRecord | null | undefined
): AnyRecord | null {
  if (!game || typeof game !== "object") return null;
  try {
    const out: AnyRecord = { ...game };
    const zones = (out as AnyRecord).zones;
    if (zones && typeof zones === "object") {
      delete (out as AnyRecord).zones;
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
    } catch {}
    const out = { type: "spectatorsUpdated", matchId, count };
    try {
      io.to(room).emit("message", out);
    } catch {}
    try {
      io.to(`match:${matchId}`).emit("message", out);
    } catch {}
  } catch {}
}

