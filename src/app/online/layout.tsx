"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SocketTransport } from "@/lib/net/socketTransport";
import type {
  LobbyInfo,
  MatchInfo,
  ServerChatPayloadT,
  PlayerInfo,
  LobbyInvitePayloadT,
  LobbyVisibility,
  ChatScope,
} from "@/lib/net/protocol";
import type { StartMatchConfig } from "@/lib/net/transport";
import { useGameStore } from "@/lib/game/store";

const PLAYER_NAME_KEY = "sorcery:playerName";
const PLAYER_ID_KEY = "sorcery:playerId";

type OnlineContextValue = {
  transport: SocketTransport | null;
  connected: boolean;
  displayName: string;
  setDisplayName: () => void;
  me: PlayerInfo | null;
  lobby: LobbyInfo | null;
  match: MatchInfo | null;
  ready: boolean;
  toggleReady: () => void;
  joinLobby: (id?: string) => Promise<void>;
  createLobby: (options?: { visibility?: LobbyVisibility; maxPlayers?: number }) => Promise<void>;
  leaveLobby: () => void;
  startMatch: (matchConfig?: StartMatchConfig) => void;
  joinMatch: (id: string) => Promise<void>;
  leaveMatch: () => void;
  sendChat: (msg: string, scope?: ChatScope) => void;
  resync: () => void;
  resyncing: boolean;
  chatLog: ServerChatPayloadT[];
  // Extended state
  lobbies: LobbyInfo[];
  players: PlayerInfo[];
  invites: LobbyInvitePayloadT[];
  // Extended actions
  requestLobbies: () => void;
  requestPlayers: () => void;
  setLobbyVisibility: (visibility: LobbyVisibility) => void;
  inviteToLobby: (targetPlayerId: string, lobbyId?: string) => void;
  dismissInvite: (lobbyId: string, fromId: string) => void;
};

const OnlineContext = createContext<OnlineContextValue | undefined>(undefined);

export function useOnline(): OnlineContextValue {
  const ctx = useContext(OnlineContext);
  if (!ctx) throw new Error("useOnline must be used within <OnlineLayout>");
  return ctx;
}

export default function OnlineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isMatchPage =
    pathname?.includes("/online/play/") && pathname !== "/online/play";
  const isLobbyPage = pathname?.startsWith("/online/lobby");

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
  const [lobbies, setLobbies] = useState<LobbyInfo[]>([]);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [invites, setInvites] = useState<LobbyInvitePayloadT[]>([]);
  const [resyncing, setResyncing] = useState<boolean>(false);
  // Track latest "me" across event handlers without re-subscribing
  const meRef = useRef<PlayerInfo | null>(null);

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

  // Monotonic token to guard resync state across overlapping attempts
  const resyncGenRef = useRef<number>(0);

  // Batch incoming server patches to a single RAF to avoid rapid re-entrancy during reconnects
  const patchQueueRef = useRef<Array<{ patch: unknown; t?: number }>>([]);
  const patchFlushScheduledRef = useRef<boolean>(false);
  const queueServerPatch = (patch: unknown, t?: number) => {
    patchQueueRef.current.push({ patch, t });
    if (patchFlushScheduledRef.current) return;
    patchFlushScheduledRef.current = true;
    requestAnimationFrame(() => {
      patchFlushScheduledRef.current = false;
      const items = patchQueueRef.current;
      patchQueueRef.current = [];
      for (const it of items) {
        try {
          useGameStore.getState().applyServerPatch(it.patch, it.t);
        } catch (e) {
          console.warn("applyServerPatch failed", e);
        }
      }
    });
  };

  // Inject transport into store once; remove on unmount
  useEffect(() => {
    useGameStore.getState().setTransport(transport);
    return () => {
      try {
        useGameStore.getState().setTransport(null);
      } catch {}
    };
  }, [transport]);

  // Keep a ref to current player info for event handlers
  useEffect(() => {
    meRef.current = me;
  }, [me]);

  useEffect(() => {
    // Only connect if name has been submitted
    if (!nameSubmitted || !displayName.trim()) {
      return;
    }

    const unsubscribers: Array<() => void> = [];

    (async () => {
      try {
        // Ensure we have a stable player id for reconnects
        const getOrCreatePlayerId = (): string | undefined => {
          try {
            let pid = localStorage.getItem(PLAYER_ID_KEY);
            if (!pid) {
              pid = `p_${Math.random().toString(36).slice(2, 8)}${Date.now()
                .toString(36)
                .slice(-4)}`;
              localStorage.setItem(PLAYER_ID_KEY, pid);
            }
            return pid;
          } catch {
            return undefined;
          }
        };

        await transport.connect({
          displayName,
          playerId: getOrCreatePlayerId(),
        });
        setConnected(true);
      } catch (e) {
        console.error("connect failed", e);
      }
    })();

    unsubscribers.push(
      transport.on("welcome", (p) => {
        setMe(p.you);
        // Note: Removed auto-rejoin logic as it causes loops without persistent player IDs
        // Fetch initial lists
        try {
          transport.requestLobbies();
          transport.requestPlayers();
        } catch {}
      }),
      transport.on("lobbyUpdated", (p) => {
        setLobby(p.lobby);
        const you = meRef.current;
        setReady(
          you ? p.lobby.readyPlayerIds?.includes(you.id) ?? false : false
        );
      }),
      transport.on("lobbiesUpdated", (p) => {
        setLobbies(p.lobbies);
      }),
      transport.on("playerList", (p) => {
        setPlayers(p.players);
      }),
      transport.on("lobbyInvite", (p) => {
        setInvites((prev) => {
          // de-dup by lobbyId + from.id
          const key = `${p.lobbyId}:${p.from.id}`;
          const exists = prev.some((i) => `${i.lobbyId}:${i.from.id}` === key);
          if (exists) return prev;
          return [...prev, p];
        });
      }),
      transport.on("matchStarted", (p) => {
        // If we've previously declined to rejoin this match locally, ensure we leave and suppress UI
        try {
          const key = `sorcery:declinedRejoin:${p.match.id}`;
          const declined =
            typeof window !== "undefined" ? localStorage.getItem(key) : null;
          if (declined) {
            try {
              transport.leaveMatch();
            } catch {}
            setMatch(null);
            return;
          }
        } catch {}

        setMatch(p.match);
        // Log match start
        if (p.match.status === "waiting") {
          useGameStore
            .getState()
            .log(
              `Match started with ${p.match.players
                .map((pl) => pl.displayName)
                .join(" and ")}`
            );
        }
      }),
      // Apply incremental game state patches into the Zustand store
      transport.on("statePatch", (p) => {
        queueServerPatch(p.patch, p.t);
      }),
      transport.on("chat", (p) =>
        setChatLog((prev) => {
          // Don't add duplicate messages
          const lastMessage = prev[prev.length - 1];
          if (
            lastMessage &&
            lastMessage.content === p.content &&
            lastMessage.from?.displayName === p.from?.displayName
          ) {
            return prev;
          }
          return [...prev, p];
        })
      ),
      transport.on("resync", (p) => {
        // Enter resync mode to pause physics world on clients
        const gen = ++resyncGenRef.current;
        setResyncing(true);
        const snap = p.snapshot as {
          lobby?: LobbyInfo;
          match?: MatchInfo;
          game?: unknown;
          t?: number;
        };
        // Debug: server-initiated resync snapshot received
        try {
          console.debug("[online] resync start (server snapshot) ->", {
            matchInSnap: snap?.match?.id,
            hasLobby: !!snap?.lobby,
            hasGame: !!snap?.game,
            t: snap?.t,
            gen,
          });
        } catch {}
        if (snap?.lobby) {
          setLobby(snap.lobby);
          const you = meRef.current;
          setReady(
            you ? snap.lobby.readyPlayerIds?.includes(you.id) ?? false : false
          );
        }

        // Track whether we should apply the game snapshot
        let allowApplyGame = true;

        if (snap?.match) {
          // Respect locally-declined rejoin state and immediately leave/suppress if present
          try {
            const key = `sorcery:declinedRejoin:${snap.match.id}`;
            const declined =
              typeof window !== "undefined" ? localStorage.getItem(key) : null;
            if (declined) {
              allowApplyGame = false;
              try {
                transport.leaveMatch();
              } catch {}
              setMatch(null);
            } else {
              setMatch(snap.match);
            }
          } catch {
            setMatch(snap.match);
          }
        } else {
          // No match in snapshot means we're not in a game; do not apply snapshot
          allowApplyGame = false;
        }

        if (!snap?.lobby && !snap?.match) {
          setLobby(null);
          setMatch(null);
          setReady(false);
          allowApplyGame = false;
        }

        // Apply full game snapshot if provided and allowed
        if (allowApplyGame && snap?.game) {
          try {
            queueServerPatch(
              snap.game,
              typeof snap.t === "number" ? snap.t : undefined
            );
          } catch (e) {
            console.warn("Failed to apply resync game snapshot", e);
          }
        }
        // Debug: report whether we applied the snapshot
        try {
          console.debug("[online] resync apply ->", {
            allowApplyGame,
            hasGame: !!snap?.game,
            gen,
          });
        } catch {}
        // Clear resyncing on the next frame after queueing applies
        try {
          requestAnimationFrame(() => {
            if (resyncGenRef.current !== gen) {
              try {
                console.debug(
                  "[online] resync stop ignored (newer resync started)",
                  { gen, current: resyncGenRef.current }
                );
              } catch {}
              return;
            }
            try {
              console.debug("[online] resync stop (server)", { gen });
            } catch {}
            setResyncing(false);
          });
        } catch {
          if (resyncGenRef.current === gen) {
            try {
              console.debug("[online] resync stop (server, immediate)", {
                gen,
              });
            } catch {}
            setResyncing(false);
          } else {
            try {
              console.debug(
                "[online] resync stop immediate ignored (superseded)",
                { gen, current: resyncGenRef.current }
              );
            } catch {}
          }
        }
      }),
      transport.on("error", (p) => console.warn("server error", p))
    );

    return () => {
      unsubscribers.forEach((u) => u());
      transport.disconnect();
      setConnected(false);
      setLobbies([]);
      setPlayers([]);
      setInvites([]);
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
    setDisplayName: changeDisplayName, // Triggers name change mode
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
      // Reset local ready state on lobby join; server updates will resync this shortly
      setReady(false);
    },
    createLobby: async (options?: { visibility?: LobbyVisibility; maxPlayers?: number }) => {
      await transport.createLobby(options);
      // Reset local ready state on lobby creation; server updates will resync this shortly
      setReady(false);
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
    startMatch: (matchConfig?: StartMatchConfig) => {
      transport.startMatch(matchConfig);
    },
    joinMatch: async (id: string) => {
      try {
        // Clear any previously declined rejoin flag for this match
        try {
          localStorage.removeItem(`sorcery:declinedRejoin:${id}`);
        } catch {}
      } catch {}
      await transport.joinMatch(id);
    },
    leaveMatch: () => {
      try {
        const myName = me?.displayName || "A player";
        const matchId = match?.id;

        // Send a chat message to notify other players
        if (me) {
          transport.sendChat(`${myName} has left the match.`, "match");
        }

        // Tell the server we've left the match so it doesn't prompt rejoin on reconnect
        try {
          transport.leaveMatch();
        } catch {}

        // Persist declined rejoin decision locally for this match
        if (matchId) {
          try {
            localStorage.setItem(`sorcery:declinedRejoin:${matchId}`, "1");
          } catch {}
        }

        // Clear match state
        setMatch(null);

        // Log the leave event locally
        useGameStore.getState().log(`You left the match.`);
      } catch {}
    },
    sendChat: (msg: string, scope?: ChatScope) => {
      if (!msg.trim()) return;
      transport.sendChat(msg.trim(), scope);
    },
    resync: () => {
      const gen = ++resyncGenRef.current;
      setResyncing(true);
      // Debug: client-initiated resync start
      try {
        console.debug("[online] resync start (client request) ->", {
          matchId: match?.id,
          gen,
        });
      } catch {}
      try {
        transport.resync();
      } catch {}
      // Fallback safety: clear resyncing if server doesn't respond, but only if no newer resync started
      try {
        setTimeout(() => {
          if (resyncGenRef.current !== gen) {
            try {
              console.debug("[online] resync fallback ignored (superseded)", {
                gen,
                current: resyncGenRef.current,
              });
            } catch {}
            return;
          }
          try {
            console.debug(
              "[online] resync fallback clear (no server response)",
              { gen }
            );
          } catch {}
          setResyncing(false);
        }, 2500);
      } catch {}
    },
    resyncing,
    chatLog,
    lobbies,
    players,
    invites,
    requestLobbies: () => {
      try {
        transport.requestLobbies();
      } catch {}
    },
    requestPlayers: () => {
      try {
        transport.requestPlayers();
      } catch {}
    },
    setLobbyVisibility: (visibility: LobbyVisibility) => {
      try {
        transport.setLobbyVisibility(visibility);
      } catch {}
    },
    inviteToLobby: (targetPlayerId: string, lobbyId?: string) => {
      try {
        transport.inviteToLobby(targetPlayerId, lobbyId);
      } catch {}
    },
    dismissInvite: (lobbyId: string, fromId: string) => {
      setInvites((prev) =>
        prev.filter((i) => !(i.lobbyId === lobbyId && i.from.id === fromId))
      );
    },
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
                <h1 className="text-xl font-semibold font-fantaisie">
                  Online Play
                </h1>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    connected
                      ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                      : "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30"
                  }`}
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
                <Link
                  className="ml-2 text-xs underline text-slate-300/80 hover:text-slate-200"
                  href="/replay"
                >
                  Replays
                </Link>
              </div>
              {!nameSubmitted ? (
                <div className="bg-slate-900/60 rounded-xl ring-1 ring-slate-800 p-4">
                  <div className="text-sm font-semibold opacity-90 mb-3">
                    Enter Display Name
                  </div>
                  <div className="space-y-3">
                    <div>
                      <input
                        className="w-full bg-slate-800/70 ring-1 ring-slate-700 rounded px-3 py-2 text-sm placeholder-slate-400"
                        placeholder="Enter your name (min 2 characters)"
                        value={tempDisplayName}
                        onChange={(e) => setTempDisplayName(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && submitDisplayName()
                        }
                      />
                    </div>
                    <button
                      className="w-full rounded bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={submitDisplayName}
                      disabled={
                        !tempDisplayName.trim() ||
                        tempDisplayName.trim().length < 2
                      }
                    >
                      Set Name & Connect
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="text-xs opacity-70">Display Name</label>
                    <span className="bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm">
                      {displayName}
                    </span>
                  </div>
                  <button
                    className="text-xs underline text-slate-300/80 hover:text-slate-200"
                    onClick={changeDisplayName}
                  >
                    Change
                  </button>
                </div>
              )}
              {!isLobbyPage && (
                <div className="bg-slate-900/60 rounded-xl ring-1 ring-slate-800 p-4">
                  <div className="text-sm font-semibold opacity-90">
                    Game State (live)
                  </div>
                  <div className="mt-3 text-sm space-y-2">
                    <div>
                      <span className="opacity-70">Phase:</span> {gamePhase}
                    </div>
                    <div>
                      <span className="opacity-70">Current Player:</span> P
                      {currentPlayer}
                    </div>
                    <div>
                      <span className="opacity-70">Events:</span> {eventSeq}
                    </div>
                    <div>
                      <span className="opacity-70">Last Server t:</span>{" "}
                      {lastServerTs || 0}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="opacity-70">Pending patches:</span>{" "}
                      {pendingCount}
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
              )}
            </div>
            {children}
          </div>
        </div>
      )}
    </OnlineContext.Provider>
  );
}
