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

type EventKind = "players" | "phases" | "matches" | "prep" | "presence";

interface TournamentEventItem {
  ts: number;
  kind: EventKind;
  text: string;
  mine?: boolean;
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
    prep: boolean;
    presence: boolean;
    mineOnly: boolean;
  } = {
    players: true,
    phases: true,
    matches: true,
    prep: true,
    presence: true,
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
      }),
    onPlayerJoined: (d) =>
      pushEvent({
        kind: "players",
        ts: Date.now(),
        text: `${d.playerName} joined (${d.currentPlayerCount})`,
        mine: myId != null && d.playerId === myId,
      }),
    onPlayerLeft: (d) =>
      pushEvent({
        kind: "players",
        ts: Date.now(),
        text: `${d.playerName} left (${d.currentPlayerCount})`,
        mine: myId != null && d.playerId === myId,
      }),
    onRoundStarted: (d) => {
      pushEvent({
        kind: "matches",
        ts: Date.now(),
        text: `Round ${d.roundNumber} started`,
      });
      notifyCollapsed(`Round ${d.roundNumber} started`);
    },
    onMatchAssigned: (d) => {
      pushEvent({
        kind: "matches",
        ts: Date.now(),
        text: `Match assigned${d.opponentName ? ` vs ${d.opponentName}` : ""}`,
      });
      notifyCollapsed(
        `Match assigned${d.opponentName ? ` vs ${d.opponentName}` : ""}`
      );
    },
    onPreparationUpdate: (d) =>
      pushEvent({
        kind: "prep",
        ts: Date.now(),
        text: `Preparation updated (${d.readyPlayerCount}/${d.totalPlayerCount})`,
        mine: myId != null && d.playerId === myId,
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
      <div className="bg-black/60 backdrop-blur rounded-xl ring-1 ring-white/10 shadow">
        {/* Header: show when open, or always for panel mode */}
        {(open || mode !== "bubble") && (
          <div className="flex items-center justify-between px-3 py-2 text-sm border-b border-white/10 select-none">
            <div className="flex items-center gap-2">
              <button
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  activeTab === "chat"
                    ? "bg-white/20 text-white"
                    : "hover:bg-white/10 opacity-70"
                }`}
                onClick={() => {
                  setActiveTab("chat");
                  if (!open) setOpen(true);
                }}
              >
                <MessageCircle className="w-3 h-3" /> Chat
                {chat.length > 0 && (
                  <span className="bg-green-500 text-white text-xs px-1 rounded-full">
                    {chat.length}
                  </span>
                )}
              </button>
              <button
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  activeTab === "events"
                    ? "bg-white/20 text-white"
                    : "hover:bg-white/10 opacity-70"
                }`}
                onClick={() => {
                  setActiveTab("events");
                  if (!open) setOpen(true);
                }}
              >
                <ScrollText className="w-3 h-3" /> Events
                {events.length > 0 && (
                  <span className="bg-blue-500 text-white text-xs px-1 rounded-full">
                    {events.length}
                  </span>
                )}
              </button>
              <button
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  activeTab === "players"
                    ? "bg-white/20 text-white"
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
              className="rounded bg-white/10 hover:bg-white/20 px-2 py-0.5 text-xs transition-colors"
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
                <div className="overflow-y-auto px-3 py-3 text-xs space-y-1 max-h-48">
                  {chat.length === 0 && (
                    <div className="opacity-60">No messages</div>
                  )}
                  {chat.slice(-200).map((m, i) => (
                    <div key={i} className="opacity-90">
                      <span className="font-medium">{m.from}</span>: {m.content}
                    </div>
                  ))}
                </div>
                <div className="px-3 pb-3 pt-2 border-t border-white/10 flex gap-2 select-none">
                  <input
                    className="flex-1 bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-xs"
                    placeholder="Type a message..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") send();
                    }}
                    disabled={!tournamentId}
                  />
                  <button
                    className="rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1 text-xs transition-colors"
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
                <div className="overflow-y-auto px-3 py-3 text-xs space-y-1 max-h-64">
                  {events
                    .filter(
                      (ev) => filters[ev.kind] && (!filters.mineOnly || ev.mine)
                    )
                    .slice(-200).length === 0 && (
                    <div className="opacity-60">No events yet</div>
                  )}
                  {events
                    .filter(
                      (ev) => filters[ev.kind] && (!filters.mineOnly || ev.mine)
                    )
                    .slice(-200)
                    .map((ev, i) => (
                      <div key={i} className="opacity-85">
                        •{" "}
                        {new Date(ev.ts).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        — {ev.text}
                      </div>
                    ))}
                </div>
              </div>
            )}
            {activeTab === "players" && (
              <div className="overflow-y-auto px-3 py-3 text-xs space-y-1 max-h-64">
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
                    <div className="text-[10px] text-slate-300 ml-3 whitespace-nowrap">
                      {p.state}
                    </div>
                  </div>
                ))}
                {computePlayers(rt, tournamentId).length === 0 && (
                  <div className="opacity-60">No players</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && !open && (
        <div
          className="absolute top-[-70px] left-0 right-0 bg-black/70 rounded-lg px-4 py-3 text-sm text-white shadow-xl cursor-pointer transform transition-all duration-300 ease-out z-20"
          onClick={() => {
            setOpen(true);
            setToast(null);
            setActiveTab("chat");
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">💬</span>
            <span className="font-medium truncate">{toast}</span>
            <span className="text-xs opacity-75 ml-auto">Click to view</span>
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
          className="fixed left-4 bottom-4 z-[5001] w-11 h-11 rounded-full bg-black/70 ring-1 ring-white/20 backdrop-blur flex items-center justify-center hover:bg-black/60"
          style={{
            left: `calc(env(safe-area-inset-left, 0px) + 16px)`,
            bottom: `calc(env(safe-area-inset-bottom, 0px) + 16px)`,
          }}
          onClick={() => setOpen(true)}
        >
          <MessageCircle className="w-5 h-5 text-white" />
        </button>
      )}
      {mode === "bubble" && toast && !open && (
        <div
          className="fixed z-[5002] bg-black/70 rounded-lg px-4 py-3 text-sm text-white shadow-xl cursor-pointer transform transition-all duration-300 ease-out"
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
            <span className="text-lg">💬</span>
            <span className="font-medium truncate max-w-[60vw]">{toast}</span>
            <span className="text-xs opacity-75 ml-auto">Click to view</span>
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
