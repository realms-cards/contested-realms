"use client";

import {
  MessageCircle,
  ScrollText,
  ChevronUp,
  ChevronDown,
  Users2,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRealtimeTournamentsOptional } from "@/contexts/RealtimeTournamentContext";
import { useTournamentSocket } from "@/hooks/useTournamentSocket";

type EventKind = "players" | "phases" | "matches" | "match_results" | "prep" | "presence" | "system";

interface TournamentEventItem {
  ts: number;
  kind: EventKind;
  text: string;
  mine?: boolean;
  icon?: string;
  color?: string;
}

interface FloatingChatProps {
  tournamentId: string | null;
  mode?: "panel" | "bubble";
}

export default function FloatingChat({
  tournamentId,
  mode = "panel",
}: FloatingChatProps) {
  const rt = useRealtimeTournamentsOptional();
  const { data: session } = useSession();
  const myId = session?.user?.id ?? null;
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "events" | "players">(
    "chat"
  );
  const [chatInput, setChatInput] = useState("");
  const [chat, setChat] = useState<
    Array<{ from: string; content: string; ts: number }>
  >([]);
  const [events, setEvents] = useState<TournamentEventItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const lastToastAtRef = useRef<number>(0);
  const filters: {
    players: boolean;
    phases: boolean;
    matches: boolean;
    match_results: boolean;
    prep: boolean;
    presence: boolean;
    system: boolean;
    mineOnly: boolean;
  } = {
    players: true,
    phases: true,
    matches: true,
    match_results: true,
    prep: true,
    presence: true,
    system: true,
    mineOnly: false,
  };
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const { socket, joinTournament } = useTournamentSocket({
    onPhaseChanged: (d) =>
      pushEvent({
        kind: "phases",
        ts: Date.now(),
        text: `Phase changed → ${d.newStatus}`,
        icon: "🔄",
        color: "text-blue-400"
      }),
    onPlayerJoined: (d) =>
      pushEvent({
        kind: "players",
        ts: Date.now(),
        text: `${d.playerName} joined (${d.currentPlayerCount} players)`,
        mine: myId != null && d.playerId === myId,
        icon: "✅",
        color: "text-green-400"
      }),
    onPlayerLeft: (d) =>
      pushEvent({
        kind: "players",
        ts: Date.now(),
        text: `${d.playerName} left (${d.currentPlayerCount} players)`,
        mine: myId != null && d.playerId === myId,
        icon: "👋",
        color: "text-slate-400"
      }),
    onRoundStarted: (d) => {
      pushEvent({
        kind: "matches",
        ts: Date.now(),
        text: `Round ${d.roundNumber} started`,
        icon: "🔔",
        color: "text-purple-400"
      });
      notifyCollapsed(`Round ${d.roundNumber} started`);
    },
    onMatchAssigned: (d) => {
      pushEvent({
        kind: "matches",
        ts: Date.now(),
        text: `Match assigned${d.opponentName ? ` vs ${d.opponentName}` : ""}`,
        icon: "⚔️",
        color: "text-cyan-400"
      });
      notifyCollapsed(
        `Match assigned${d.opponentName ? ` vs ${d.opponentName}` : ""}`
      );
    },
    onPreparationUpdate: (d) =>
      pushEvent({
        kind: "prep",
        ts: Date.now(),
        text: `${d.readyPlayerCount}/${d.totalPlayerCount} players ready`,
        mine: myId != null && d.playerId === myId,
        icon: "⏳",
        color: "text-amber-400"
      }),
    // Do not log presence-only updates to reduce noise
    onPresenceUpdated: () => {},
  });
  const joinedRef = useRef<string | null>(null);

  const pushEvent = useCallback((e: TournamentEventItem) => {
    setEvents((prev) => {
      const next = [...prev, e];
      if (next.length > 200) next.shift();
      return next;
    });
  }, []);

  const notifyCollapsed = useCallback(
    (msg: string) => {
      if (open) return; // only when collapsed
      const now = Date.now();
      if (now - lastToastAtRef.current < 2500) return; // debounce
      lastToastAtRef.current = now;
      setToast(msg);
      window.setTimeout(() => setToast(null), 4000);
    },
    [open]
  );

  // Join tournament room if needed for events
  useEffect(() => {
    if (!tournamentId) {
      joinedRef.current = null;
      return;
    }
    // If a RealtimeTournamentProvider is mounted, it manages joining.
    if (rt) return;
    if (joinedRef.current === tournamentId) return;
    joinedRef.current = tournamentId;
    joinTournament(tournamentId);
  }, [tournamentId, joinTournament, rt]);

  // Listen for tournament chat messages
  useEffect(() => {
    if (!socket || !tournamentId) return;
    const onChat = (data: {
      tournamentId: string;
      from: string;
      content: string;
      timestamp: number;
    }) => {
      if (data.tournamentId !== tournamentId) return;
      setChat((prev) => [
        ...prev,
        { from: data.from, content: data.content, ts: data.timestamp },
      ]);
      notifyCollapsed(`${data.from}: ${data.content}`);
    };
    socket.on("TOURNAMENT_CHAT", onChat);
    return () => {
      socket.off("TOURNAMENT_CHAT", onChat);
    };
  }, [socket, tournamentId, notifyCollapsed]);

  // Listen for match results
  useEffect(() => {
    if (!socket || !tournamentId) return;

    const onMatchCompleted = (data: {
      tournamentId: string;
      matchId: string;
      winnerId?: string;
      winnerName?: string;
      loserId?: string;
      loserName?: string;
      isDraw?: boolean;
      player1Name?: string;
      player2Name?: string;
    }) => {
      if (data.tournamentId !== tournamentId) return;

      const isMine = !!(myId && (myId === data.winnerId || myId === data.loserId));

      if (data.isDraw) {
        pushEvent({
          kind: "match_results",
          ts: Date.now(),
          text: `Match ended in a draw${data.player1Name && data.player2Name ? ` (${data.player1Name} vs ${data.player2Name})` : ''}`,
          mine: isMine,
          icon: "🤝",
          color: "text-slate-300"
        });
      } else if (data.winnerName) {
        const text = data.loserName
          ? `${data.winnerName} defeated ${data.loserName}`
          : `${data.winnerName} won their match`;

        pushEvent({
          kind: "match_results",
          ts: Date.now(),
          text,
          mine: isMine,
          icon: "🏆",
          color: myId === data.winnerId ? "text-amber-400" : "text-slate-300"
        });

        if (isMine) {
          notifyCollapsed(text);
        }
      }
    };

    const onRoundCompleted = (data: {
      tournamentId: string;
      roundNumber: number;
    }) => {
      if (data.tournamentId !== tournamentId) return;

      pushEvent({
        kind: "system",
        ts: Date.now(),
        text: `Round ${data.roundNumber} completed`,
        icon: "✓",
        color: "text-emerald-400"
      });
    };

    const onTournamentCompleted = (data: {
      tournamentId: string;
      winnerId?: string;
      winnerName?: string;
    }) => {
      if (data.tournamentId !== tournamentId) return;

      const text = data.winnerName
        ? `Tournament completed! Winner: ${data.winnerName}`
        : 'Tournament completed!';

      pushEvent({
        kind: "system",
        ts: Date.now(),
        text,
        mine: !!(myId && myId === data.winnerId),
        icon: "🎉",
        color: "text-yellow-400"
      });

      notifyCollapsed(text);
    };

    socket.on("MATCH_COMPLETED", onMatchCompleted);
    socket.on("ROUND_COMPLETED", onRoundCompleted);
    socket.on("TOURNAMENT_COMPLETED", onTournamentCompleted);

    return () => {
      socket.off("MATCH_COMPLETED", onMatchCompleted);
      socket.off("ROUND_COMPLETED", onRoundCompleted);
      socket.off("TOURNAMENT_COMPLETED", onTournamentCompleted);
    };
  }, [socket, tournamentId, myId, pushEvent, notifyCollapsed]);

  // Send chat
  const send = () => {
    const m = chatInput.trim();
    if (!m || !tournamentId) return;
    rt?.sendTournamentChat?.(tournamentId, m);
    setChatInput("");
  };

  // Force bottom-left anchoring for robustness across browsers
  const positionClasses = "left-4 bottom-4";

  const content = (
    <div
      className={`fixed ${positionClasses} z-[5000] text-white w-80 pointer-events-auto`}
      style={{
        left: `calc(env(safe-area-inset-left, 0px) + 16px)`,
        bottom: `calc(env(safe-area-inset-bottom, 0px) + 16px)`,
      }}
    >
      <div className="rc-panel backdrop-blur-[6px]">
        {/* Header: show when open, or always for panel mode */}
        {(open || mode !== "bubble") && (
          <div className="flex select-none items-center justify-between border-b border-rc-line/14 px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <button
                className={`flex cursor-pointer items-center gap-1 rounded-rc-sm px-2 py-1 font-rc-mono text-[11px] uppercase tracking-[0.14em] transition-colors ${
                  activeTab === "chat"
                    ? "bg-rc-accent text-rc-accent-fg"
                    : "hover:bg-white/10 opacity-70"
                }`}
                onClick={() => {
                  setActiveTab("chat");
                  if (!open) setOpen(true);
                }}
              >
                <MessageCircle className="w-3 h-3" /> Chat
                {chat.length > 0 && (
                  <span className="rounded-full bg-rc-success px-1 font-rc-mono text-[10px] text-[#0b1020]">
                    {chat.length}
                  </span>
                )}
              </button>
              <button
                className={`flex cursor-pointer items-center gap-1 rounded-rc-sm px-2 py-1 font-rc-mono text-[11px] uppercase tracking-[0.14em] transition-colors ${
                  activeTab === "events"
                    ? "bg-rc-accent text-rc-accent-fg"
                    : "hover:bg-white/10 opacity-70"
                }`}
                onClick={() => {
                  setActiveTab("events");
                  if (!open) setOpen(true);
                }}
              >
                <ScrollText className="w-3 h-3" /> Events
                {events.length > 0 && (
                  <span className="rounded-full bg-rc-info px-1 font-rc-mono text-[10px] text-[#0b1020]">
                    {events.length}
                  </span>
                )}
              </button>
              <button
                className={`flex cursor-pointer items-center gap-1 rounded-rc-sm px-2 py-1 font-rc-mono text-[11px] uppercase tracking-[0.14em] transition-colors ${
                  activeTab === "players"
                    ? "bg-rc-accent text-rc-accent-fg"
                    : "hover:bg-white/10 opacity-70"
                }`}
                onClick={() => {
                  setActiveTab("players");
                  if (!open) setOpen(true);
                }}
              >
                <Users2 className="w-3 h-3" /> Players
              </button>
            </div>
            <button
              className="cursor-pointer rounded-rc-sm border border-rc-line/22 px-2 py-0.5 text-rc-fg-muted transition-colors hover:border-rc-accent hover:text-rc-accent-ring"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </button>
          </div>
        )}

        {/* Content */}
        {open && (
          <div className="max-h-64">
            {activeTab === "chat" && (
              <div className="flex flex-col">
                <div className="thin-scrollbar max-h-48 space-y-1 overflow-y-auto px-3 py-3 font-rc-mono text-xs">
                  {chat.length === 0 && (
                    <div className="rc-hint">no messages</div>
                  )}
                  {chat.slice(-200).map((m, i) => (
                    <div key={i} className="opacity-90">
                      <span className="font-medium">{m.from}</span>: {m.content}
                    </div>
                  ))}
                </div>
                <div className="flex select-none gap-2 border-t border-rc-line/14 px-3 pb-3 pt-2">
                  <input
                    className="rc-input h-8 flex-1 text-xs"
                    placeholder="Type a message..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") send();
                    }}
                    disabled={!tournamentId}
                  />
                  <button
                    className="cursor-pointer rounded-rc-md border border-rc-accent-press bg-gradient-to-b from-rc-accent-hover to-rc-accent px-3 py-1 font-rc-sans text-xs font-medium text-rc-accent-fg transition-transform hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={send}
                    disabled={!tournamentId || !chatInput.trim()}
                  >
                    Send
                  </button>
                </div>
              </div>
            )}
            {activeTab === "events" && (
              <div className="flex flex-col">
                <div className="thin-scrollbar max-h-64 space-y-1 overflow-y-auto px-3 py-3 font-rc-mono text-xs">
                  {events
                    .filter(
                      (ev) => filters[ev.kind] && (!filters.mineOnly || ev.mine)
                    )
                    .slice(-200).length === 0 && (
                    <div className="rc-hint">no events yet</div>
                  )}
                  {events
                    .filter(
                      (ev) => filters[ev.kind] && (!filters.mineOnly || ev.mine)
                    )
                    .slice(-200)
                    .map((ev, i) => (
                      <div
                        key={i}
                        className={`opacity-90 ${ev.color || ''} ${ev.mine ? 'font-medium' : ''}`}
                      >
                        {ev.icon ? `${ev.icon} ` : '• '}
                        <span className="opacity-70">
                          {new Date(ev.ts).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {" — "}
                        {ev.text}
                      </div>
                    ))}
                </div>
              </div>
            )}
            {activeTab === "players" && (
              <div className="thin-scrollbar max-h-64 space-y-1 overflow-y-auto px-3 py-3 font-rc-mono text-xs">
                {computePlayers(rt, tournamentId).map((p) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${
                          p.isConnected ? "bg-emerald-500" : "bg-slate-500"
                        }`}
                      />
                      <span className="truncate">{p.name}</span>
                    </div>
                    <div className="ml-3 whitespace-nowrap font-rc-mono text-[10px] text-rc-fg-subtle">
                      {p.state}
                    </div>
                  </div>
                ))}
                {computePlayers(rt, tournamentId).length === 0 && (
                  <div className="rc-hint">no players</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && !open && (
        <div
          className="rc-panel absolute left-0 right-0 top-[-70px] z-20 transform cursor-pointer px-4 py-3 font-rc-sans text-sm transition-all duration-300 ease-out"
          onClick={() => {
            setOpen(true);
            setToast(null);
            setActiveTab("chat");
          }}
        >
          <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{toast}</span>
            <span className="ml-auto font-rc-mono text-[10px] uppercase tracking-[0.14em] text-rc-fg-subtle">click to view</span>
          </div>
        </div>
      )}
    </div>
  );

  if (!mounted) return null;
  return createPortal(
    <>
      {/* Bubble launcher for compact contexts */}
      {mode === "bubble" && !open && (
        <button
          aria-label="Open tournament chat"
          className="fixed bottom-4 left-4 z-[5001] flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-rc-line/22 bg-black/70 backdrop-blur transition-colors hover:border-rc-accent"
          style={{
            left: `calc(env(safe-area-inset-left, 0px) + 16px)`,
            bottom: `calc(env(safe-area-inset-bottom, 0px) + 16px)`,
          }}
          onClick={() => setOpen(true)}
        >
          <MessageCircle className="h-5 w-5 text-rc-fg-muted" />
        </button>
      )}
      {mode === "bubble" && toast && !open && (
        <div
          className="rc-panel fixed z-[5002] transform cursor-pointer px-4 py-3 font-rc-sans text-sm transition-all duration-300 ease-out"
          style={{
            left: `calc(env(safe-area-inset-left, 0px) + 16px)`,
            bottom: `calc(env(safe-area-inset-bottom, 0px) + 86px)`,
          }}
          onClick={() => {
            setOpen(true);
            setToast(null);
            setActiveTab("chat");
          }}
        >
          <div className="flex items-center gap-2">
                        <span className="font-medium truncate max-w-[60vw]">{toast}</span>
            <span className="ml-auto font-rc-mono text-[10px] uppercase tracking-[0.14em] text-rc-fg-subtle">click to view</span>
          </div>
        </div>
      )}
      {(mode !== "bubble" || open) && content}
    </>,
    document.body
  );
}

function computePlayers(
  rt: ReturnType<typeof useRealtimeTournamentsOptional>,
  tournamentId: string | null
) {
  const t =
    rt?.currentTournament &&
    (!tournamentId || rt.currentTournament.id === tournamentId)
      ? rt.currentTournament
      : null;
  const stats = t && rt?.statistics ? rt.statistics : null;
  const presence =
    (tournamentId && rt?.getPresenceFor
      ? rt.getPresenceFor(tournamentId)
      : rt?.tournamentPresence) ?? [];
  const registered = Array.isArray(
    (
      t as unknown as {
        registeredPlayers?: Array<{
          id: string;
          displayName?: string;
          ready?: boolean;
          deckSubmitted?: boolean;
        }>;
      }
    )?.registeredPlayers
  )
    ? ((
        t as unknown as {
          registeredPlayers?: Array<{
            id: string;
            displayName?: string;
            ready?: boolean;
            deckSubmitted?: boolean;
          }>;
        }
      ).registeredPlayers as Array<{
        id: string;
        displayName?: string;
        ready?: boolean;
        deckSubmitted?: boolean;
      }>)
    : [];
  const activeRound = (stats?.rounds || []).find(
    (x: unknown) => (x as { status?: string }).status === "active"
  ) as { roundNumber?: number } | undefined;
  const activeRoundNumber =
    typeof activeRound?.roundNumber === "number"
      ? activeRound.roundNumber
      : null;
  const matches = Array.isArray(stats?.matches)
    ? (stats?.matches as Array<{
        id: string;
        roundNumber?: number | null;
        status?: string;
        players: Array<{ id: string; name?: string }>;
      }>)
    : [];
  const players = registered.map((p) => {
    let state = "joining";
    const format = (t as { format?: string } | null)?.format ?? "constructed";
    const status = (t as { status?: string } | null)?.status ?? "registering";
    if (status === "preparing") {
      const ready = Boolean(
        (p as { ready?: boolean }).ready ||
          (p as { deckSubmitted?: boolean }).deckSubmitted
      );
      if (ready) state = "ready";
      else if (format === "draft") state = "drafting";
      else state = "constructing deck";
    } else if (status === "active") {
      const my = matches.find(
        (m) =>
          (activeRoundNumber == null || m.roundNumber === activeRoundNumber) &&
          Array.isArray(m.players) &&
          m.players.some((pp) => pp.id === p.id)
      );
      if (my && my.status !== "completed") {
        const opp = (my.players || []).find((pp) => pp.id !== p.id);
        state = `playing match${opp?.name ? ` vs ${opp.name}` : ""}`;
      } else {
        state = "waiting";
      }
    }
    const pres =
      (presence as Array<{ playerId: string; isConnected: boolean }>).find(
        (x) => x.playerId === p.id
      )?.isConnected ?? false;
    return { id: p.id, name: p.displayName || p.id, isConnected: pres, state };
  });
  return players.sort((a, b) => a.name.localeCompare(b.name));
}
