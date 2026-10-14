"use client";

import { useEffect } from "react";
import { useEngineSession } from "@/lib/engine-mode/session";
import type { GameTransport } from "@/lib/net/transport";
import type { Action, PlayerId, PlayerView } from "@sorcery/shared";

/**
 * A rules-engine match against another player.
 *
 * All this does is connect the engine session to the socket and let the ordinary engine board
 * render. It can be so small because the board never knew where its picture came from: the
 * server sends `viewFor(state, seat)`, which is engine-state SHAPED, so every component reads
 * it exactly as it reads a local single-player game.
 *
 * What it does NOT do is hold a game. This client has no GameState and could not be given one
 * — it contains both hands and the RNG seed, and the seed yields deck order.
 */
export default function EngineOnlineMatch({
  matchId,
  seat,
  transport,
  children,
}: {
  matchId: string;
  /** Which engine seat this client plays, from the match roster. */
  seat: PlayerId;
  transport: GameTransport | null;
  /** The ordinary engine board. It needs no idea that the picture is arriving over a wire. */
  children: React.ReactNode;
}): React.ReactNode {
  const joinRemote = useEngineSession((s) => s.joinRemote);
  const applyRemoteView = useEngineSession((s) => s.applyRemoteView);
  const applyRemoteReject = useEngineSession((s) => s.applyRemoteReject);

  useEffect(() => {
    if (!transport || !matchId) return;
    const send = (message: unknown) => {
      // The engine channel rides the same generic message path every other transient signal
      // uses; the server names these types explicitly in its handler chain.
      void transport.sendMessage?.(message as Parameters<NonNullable<GameTransport["sendMessage"]>>[0]);
    };
    joinRemote(matchId, seat, send);

    const offView = transport.on("engine:view", (envelope) => {
      applyRemoteView({
        matchId: envelope.matchId,
        rev: envelope.rev,
        seat: envelope.seat as PlayerId,
        view: envelope.view as PlayerView,
        power: envelope.power,
        disabled: envelope.disabled ?? [],
        legal: (envelope.legal ?? []) as Action[],
        over: envelope.over,
      });
    });
    const offReject = transport.on("engine:reject", (message) => {
      applyRemoteReject(message.reason);
    });
    // A tab that was asleep may have missed views; ask for the board when it comes back rather
    // than carrying on from a stale one.
    const onVisible = () => {
      if (!document.hidden) send({ type: "engine:resync", matchId });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      offView();
      offReject();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [matchId, seat, transport, joinRemote, applyRemoteView, applyRemoteReject]);

  return children;
}
