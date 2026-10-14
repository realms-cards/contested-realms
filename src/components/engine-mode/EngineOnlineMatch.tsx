"use client";

import { useEffect } from "react";
import { useEngineSession } from "@/lib/engine-mode/session";
import type { GameTransport } from "@/lib/net/transport";
import { EngineGame } from "./EngineMatch";
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
        build: envelope.build,
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

/**
 * The whole player-vs-player engine screen: the session wired to the socket, around the same
 * board single player uses. One component so the online match page can load all of it — the
 * vendored engine included — only when a match is actually an engine match.
 */
export function EngineOnlineGame({
  matchId,
  seat,
  transport,
  onExit,
}: {
  matchId: string;
  seat: PlayerId;
  transport: GameTransport | null;
  onExit: () => void;
}) {
  // Nothing to draw until the server starts the match, which it does once BOTH decks are in.
  const started = useEngineSession((s) => s.game !== null);
  const error = useEngineSession((s) => s.lastError);
  const outdated = useEngineSession((s) => s.outdated);
  return (
    <EngineOnlineMatch matchId={matchId} seat={seat} transport={transport}>
      {outdated ? (
        <div className="fixed inset-0 flex items-center justify-center bg-[#0b0b0c] px-4 font-rc-sans text-rc-fg">
          <div className="w-full max-w-md rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.9)] p-6 text-center shadow-rc-panel">
            <h2 className="m-0 font-rc-display text-[24px] leading-tight text-rc-fg-strong">New rules version</h2>
            <p className="mt-3 text-sm text-rc-fg-muted">
              The server has been updated and runs a different version of the rules than this page. Reload to carry on —
              your match is kept.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <button
                type="button"
                onClick={onExit}
                className="rounded-rc-md border border-rc-line/30 px-4 py-1.5 text-sm text-rc-fg hover:border-rc-accent/50"
              >
                Leave
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-rc-md border border-rc-accent/60 px-4 py-1.5 text-sm text-rc-fg-strong hover:bg-rc-accent/10"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      ) : started ? (
        <EngineGame onExit={onExit} />
      ) : (
        <div className="fixed inset-0 flex items-center justify-center bg-[#0b0b0c] px-4 font-rc-sans text-rc-fg">
          <div className="w-full max-w-md rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.9)] p-6 text-center shadow-rc-panel">
            <h2 className="m-0 font-rc-display text-[24px] leading-tight text-rc-fg-strong">Rules engine match</h2>
            <p className="mt-3 text-sm text-rc-fg-muted">
              {error ?? "Your deck is in. Waiting for your opponent's deck — the game starts as soon as it arrives."}
            </p>
            <button
              type="button"
              onClick={onExit}
              className="mt-5 rounded-rc-md border border-rc-line/30 px-4 py-1.5 text-sm text-rc-fg hover:border-rc-accent/50"
            >
              Leave
            </button>
          </div>
        </div>
      )}
    </EngineOnlineMatch>
  );
}
