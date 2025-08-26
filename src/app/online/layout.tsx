"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SocketTransport } from "@/lib/net/socketTransport";
import type {
  LobbyInfo,
  MatchInfo,
  ServerChatPayloadT,
  PlayerInfo,
} from "@/lib/net/protocol";
import { useGameStore } from "@/lib/game/store";

const PLAYER_NAME_KEY = "sorcery:playerName";

type OnlineContextValue = {
  transport: SocketTransport | null;
  connected: boolean;
  displayName: string;
  setDisplayName: (name: string) => void;
  me: PlayerInfo | null;
  lobby: LobbyInfo | null;
  match: MatchInfo | null;
  ready: boolean;
  toggleReady: () => void;
  joinLobby: (id?: string) => Promise<void>;
  leaveLobby: () => void;
  startMatch: () => void;
  joinMatch: (id: string) => Promise<void>;
  leaveMatch: () => void;
  sendChat: (msg: string) => void;
  resync: () => void;
  chatLog: ServerChatPayloadT[];
};

const OnlineContext = createContext<OnlineContextValue | undefined>(undefined);

export function useOnline(): OnlineContextValue {
  const ctx = useContext(OnlineContext);
  if (!ctx) throw new Error("useOnline must be used within <OnlineLayout>");
  return ctx;
}

export default function OnlineLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMatchPage = pathname?.includes('/online/play/') && pathname !== '/online/play';
  
  const [displayName, setDisplayName] = useState<string>(() => {
    try {
      return localStorage.getItem(PLAYER_NAME_KEY) || "";
    } catch {
      return "";
    }
  });
  const [tempDisplayName, setTempDisplayName] = useState<string>(() => {
    try {
      return localStorage.getItem(PLAYER_NAME_KEY) || "";
    } catch {
      return "";
    }
  });
  const [nameSubmitted, setNameSubmitted] = useState<boolean>(() => {
    try {
      return !!localStorage.getItem(PLAYER_NAME_KEY);
    } catch {
      return false;
    }
  });
  const [connected, setConnected] = useState<boolean>(false);
  const [lobby, setLobby] = useState<LobbyInfo | null>(null);
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [ready, setReady] = useState<boolean>(false);
  const [chatLog, setChatLog] = useState<ServerChatPayloadT[]>([]);
  const [me, setMe] = useState<PlayerInfo | null>(null);

  const gamePhase = useGameStore((s) => s.phase);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const lastServerTs = useGameStore((s) => s.lastServerTs);
  const eventSeq = useGameStore((s) => s.eventSeq);
  const pendingCount = useGameStore((s) => s.pendingPatches.length);
  const flushPending = useGameStore((s) => s.flushPendingPatches);

  const transportRef = useRef<SocketTransport | null>(null);
  const transport = useMemo(() => {
    if (!transportRef.current) transportRef.current = new SocketTransport();
    return transportRef.current;
  }, []);

  // Inject transport into store once; remove on unmount
  useEffect(() => {
    useGameStore.getState().setTransport(transport);
    return () => {
      try {
        useGameStore.getState().setTransport(null);
      } catch {}
    };
  }, [transport]);

  useEffect(() => {
    // Only connect if name has been submitted
    if (!nameSubmitted || !displayName.trim()) {
      return;
    }

    const unsubscribers: Array<() => void> = [];

    (async () => {
      try {
        await transport.connect({ displayName });
        setConnected(true);
      } catch (e) {
        console.error("connect failed", e);
      }
    })();

    unsubscribers.push(
      transport.on("welcome", (p) => {
        setMe(p.you);
        // Note: Removed auto-rejoin logic as it causes loops without persistent player IDs
      }),
      transport.on("lobbyUpdated", (p) => {
        setLobby(p.lobby);
      }),
      transport.on("matchStarted", (p) => {
        setMatch(p.match);
        // Log match start
        if (p.match.status === 'waiting') {
          useGameStore.getState().log(`Match started with ${p.match.players.map(pl => pl.displayName).join(' and ')}`);
        }
      }),
      // Apply incremental game state patches into the Zustand store
      transport.on("statePatch", (p) => {
        useGameStore.getState().applyServerPatch(p.patch, p.t);
      }),
      transport.on("chat", (p) => setChatLog((prev) => {
        // Don't add duplicate messages
        const lastMessage = prev[prev.length - 1];
        if (lastMessage && lastMessage.content === p.content && lastMessage.from?.displayName === p.from?.displayName) {
          return prev;
        }
        return [...prev, p];
      })),
      transport.on("resync", (p) => {
        const snap = p.snapshot as { lobby?: LobbyInfo; match?: MatchInfo };
        if (snap?.lobby) setLobby(snap.lobby);
        if (snap?.match) setMatch(snap.match);
        if (!snap?.lobby && !snap?.match) {
          setLobby(null);
          setMatch(null);
        }
      }),
      transport.on("error", (p) => console.warn("server error", p))
    );

    return () => {
      unsubscribers.forEach((u) => u());
      transport.disconnect();
      setConnected(false);
    };
  }, [transport, displayName, nameSubmitted]);

  // Function to submit and validate display name
  const submitDisplayName = () => {
    const trimmedName = tempDisplayName.trim();
    if (trimmedName && trimmedName.length >= 2) {
      setDisplayName(trimmedName);
      setNameSubmitted(true);
      try {
        localStorage.setItem(PLAYER_NAME_KEY, trimmedName);
      } catch {}
    }
  };

  // Function to change/edit display name (disconnects first)
  const changeDisplayName = () => {
    setNameSubmitted(false);
    setConnected(false);
    setTempDisplayName(displayName);
    try {
      localStorage.removeItem(PLAYER_NAME_KEY);
    } catch {}
  };

  const ctxValue: OnlineContextValue = {
    transport,
    connected,
    displayName,
    setDisplayName: changeDisplayName, // Now this triggers name change mode
    me,
    lobby,
    match,
    ready,
    toggleReady: () => {
      const next = !ready;
      setReady(next);
      try {
        transport.ready(next);
      } catch {}
    },
    joinLobby: async (id?: string) => {
      await transport.joinLobby(id);
    },
    leaveLobby: () => {
      try {
        transport.leaveLobby();
      } finally {
        setReady(false);
        setLobby(null);
        setMatch(null);
      }
    },
    startMatch: () => {
      transport.startMatch();
    },
    joinMatch: async (id: string) => {
      await transport.joinMatch(id);
    },
    leaveMatch: () => {
      try {
        const myName = me?.displayName || "A player";
        
        // Send a chat message to notify other players
        if (me) {
          transport.sendChat(`${myName} has left the match.`);
        }
        
        // Clear match state
        setMatch(null);
        
        // Log the leave event locally
        useGameStore.getState().log(`You left the match.`);
        
        // Note: We don't call transport.leaveMatch() because there's no such method
        // The server will handle cleanup when the connection is lost
      } catch {}
    },
    sendChat: (msg: string) => {
      if (!msg.trim()) return;
      transport.sendChat(msg.trim());
    },
    resync: () => transport.resync(),
    chatLog,
  };

  return (
    <OnlineContext.Provider value={ctxValue}>
      {isMatchPage ? (
        // Full-screen match page without layout constraints
        children
      ) : (
        // Regular online layout for lobby and other pages
        <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100">
          <div className="max-w-5xl mx-auto p-6 space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold">Online</h1>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${connected ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30" : "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30"}`}
                >
                  {connected ? "Connected" : "Disconnected"}
                </span>
                {match?.id && (
                  <Link
                    className="ml-2 text-xs underline text-slate-300/80 hover:text-slate-200"
                    href={`/online/play/${encodeURIComponent(match.id)}`}
                  >
                    Go to Match
                  </Link>
                )}
                <Link
                  className="ml-2 text-xs underline text-slate-300/80 hover:text-slate-200"
                  href="/online/lobby"
                >
                  Lobby
                </Link>
              </div>
              {!nameSubmitted ? (
                <div className="bg-slate-900/60 rounded-xl ring-1 ring-slate-800 p-4">
                  <div className="text-sm font-semibold opacity-90 mb-3">Enter Display Name</div>
                  <div className="space-y-3">
                    <div>
                      <input
                        className="w-full bg-slate-800/70 ring-1 ring-slate-700 rounded px-3 py-2 text-sm placeholder-slate-400"
                        placeholder="Enter your name (min 2 characters)"
                        value={tempDisplayName}
                        onChange={(e) => setTempDisplayName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && submitDisplayName()}
                      />
                    </div>
                    <button
                      className="w-full rounded bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={submitDisplayName}
                      disabled={!tempDisplayName.trim() || tempDisplayName.trim().length < 2}
                    >
                      Set Name & Connect
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="text-xs opacity-70">Display Name</label>
                    <span className="bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm">{displayName}</span>
                  </div>
                  <button
                    className="text-xs underline text-slate-300/80 hover:text-slate-200"
                    onClick={changeDisplayName}
                  >
                    Change
                  </button>
                </div>
              )}
              <div className="bg-slate-900/60 rounded-xl ring-1 ring-slate-800 p-4">
                <div className="text-sm font-semibold opacity-90">Game State (live)</div>
                <div className="mt-3 text-sm space-y-2">
                  <div>
                    <span className="opacity-70">Phase:</span> {gamePhase}
                  </div>
                  <div>
                    <span className="opacity-70">Current Player:</span> P{currentPlayer}
                  </div>
                  <div>
                    <span className="opacity-70">Events:</span> {eventSeq}
                  </div>
                  <div>
                    <span className="opacity-70">Last Server t:</span> {lastServerTs || 0}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="opacity-70">Pending patches:</span> {pendingCount}
                    <button
                      className="px-2 py-0.5 text-xs rounded bg-white/10 hover:bg-white/20 disabled:opacity-40"
                      onClick={() => flushPending()}
                      disabled={!connected || pendingCount === 0}
                    >
                      Flush
                    </button>
                  </div>
                </div>
              </div>
            </div>
            {children}
          </div>
        </div>
      )}
    </OnlineContext.Provider>
  );
}
