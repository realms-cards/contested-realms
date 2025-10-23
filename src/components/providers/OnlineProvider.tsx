"use client";

import { useSession } from "next-auth/react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OnlineContext } from "@/app/online/online-context";
import type {
  OnlineContextValue,
  AvailablePlayer,
  VoiceIncomingRequest,
  VoiceOutgoingRequest,
  VoiceRequestPeer,
} from "@/app/online/online-context";
import { FEATURE_AUDIO_ONLY, FEATURE_SEAT_VIDEO } from "@/lib/flags";
import { useGameStore } from "@/lib/game/store";
import type {
  LobbyInfo,
  MatchInfo,
  ServerChatPayloadT,
  PlayerInfo,
  LobbyInvitePayloadT,
  LobbyVisibility,
  ChatScope,
} from "@/lib/net/protocol";
import { SocketTransport } from "@/lib/net/socketTransport";
import type { StartMatchConfig } from "@/lib/net/transport";
import { useMatchWebRTC } from "@/lib/rtc/useMatchWebRTC";



export default function OnlineProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status: sessionStatus } = useSession();
  const [connected, setConnected] = useState<boolean>(false);
  const [lobby, setLobby] = useState<LobbyInfo | null>(null);
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [ready, setReady] = useState<boolean>(false);
  const [chatLog, setChatLog] = useState<ServerChatPayloadT[]>([]);
  const [me, setMe] = useState<PlayerInfo | null>(null);
  const [lobbies, setLobbies] = useState<LobbyInfo[]>([]);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  // HTTP-available players list (rich data)
  const [availablePlayers, setAvailablePlayers] = useState<AvailablePlayer[]>([]);
  const [availablePlayersNextCursor, setAvailablePlayersNextCursor] = useState<string | null>(null);
  const [availablePlayersLoading, setAvailablePlayersLoading] = useState<boolean>(false);
  const availableQueryRef = useRef<{ q?: string; sort?: "recent" | "alphabetical" } | null>(null);
  // Cache a short-lived auth token for prioritization (JWT signed by NextAuth)
  const availableAuthRef = useRef<{ token: string; ts: number } | null>(null);
  const [invites, setInvites] = useState<LobbyInvitePayloadT[]>([]);
  const [availablePlayersError, setAvailablePlayersError] = useState<string | null>(null);
  const [socialError, setSocialError] = useState<string | null>(null);
  const socialErrorTimer = useRef<number | null>(null);
  const [connToast, setConnToast] = useState<string | null>(null);
  const [resyncing, setResyncing] = useState<boolean>(false);
  const [voicePlaybackEnabled, setVoicePlaybackEnabled] = useState(true);
  const toggleVoicePlayback = useCallback(() => {
    setVoicePlaybackEnabled((prev) => !prev);
  }, []);
  const [incomingVoiceRequest, setIncomingVoiceRequest] = useState<VoiceIncomingRequest | null>(null);
  const [outgoingVoiceRequest, setOutgoingVoiceRequest] = useState<VoiceOutgoingRequest | null>(null);
  // Track latest "me" across event handlers without re-subscribing
  const meRef = useRef<PlayerInfo | null>(null);
  // Track latest lobby across event handlers
  const lobbyRef = useRef<LobbyInfo | null>(null);
  // Track latest match across event handlers
  const matchRef = useRef<MatchInfo | null>(null);


  const transportRef = useRef<SocketTransport | null>(null);
  const transport = useMemo(() => {
    if (!transportRef.current) transportRef.current = new SocketTransport();
    return transportRef.current;
  }, []);

  // Poll socket connection and update connected flag; show a toast on disconnect
  useEffect(() => {
    if (!transport) return;
    let mounted = true;
    let disconnectedSince: number | null = null;
    let toastTimerId: number | null = null;
    
    const readConnected = () => {
      try {
        const anyT = transport as unknown as { isConnected?: () => boolean; getConnectionState?: () => string };
        if (anyT?.isConnected) return !!anyT.isConnected();
        if (anyT?.getConnectionState) return anyT.getConnectionState() === 'connected';
        return false;
      } catch {
        return false;
      }
    };
    let prev = readConnected();
    const tick = () => {
      if (!mounted) return;
      const now = readConnected();
      if (now !== prev) {
        prev = now;
        setConnected(now);
        if (!now) {
          // Connection lost - start grace period timer
          if (disconnectedSince === null) {
            disconnectedSince = Date.now();
            // Show toast after 3 seconds if still disconnected
            toastTimerId = window.setTimeout(() => {
              if (!mounted || prev) return; // Reconnected in the meantime
              setConnToast('Lost connection to the server');
              window.setTimeout(() => setConnToast(null), 4000);
            }, 3000);
          }
        } else {
          // Reconnected - clear grace period timer
          if (toastTimerId !== null) {
            window.clearTimeout(toastTimerId);
            toastTimerId = null;
          }
          disconnectedSince = null;
        }
      }
    };
    const id = window.setInterval(tick, 1000);
    try { tick(); } catch {}
    return () => {
      mounted = false;
      window.clearInterval(id);
      if (toastTimerId !== null) {
        window.clearTimeout(toastTimerId);
      }
    };
  }, [transport]);

  // Resolve the HTTP origin for the Socket server (for REST-like endpoints)
  const getSocketHttpOrigin = useCallback((): string => {
    const explicit = (process.env.NEXT_PUBLIC_WS_HTTP_ORIGIN || "").trim();
    if (explicit) return explicit;

    const wsUrl = (process.env.NEXT_PUBLIC_WS_URL || "").trim();
    if (wsUrl) {
      if (wsUrl.startsWith("ws://")) return wsUrl.replace(/^ws:\/\//, "http://");
      if (wsUrl.startsWith("wss://")) return wsUrl.replace(/^wss:\/\//, "https://");
      if (wsUrl.startsWith("http://") || wsUrl.startsWith("https://")) return wsUrl;
    }

    if (typeof window !== "undefined" && window.location?.origin) {
      return window.location.origin;
    }

    return "http://localhost:3010";
  }, []);

  const voiceScopeId = useMemo(() => {
    if (lobby?.id) return lobby.id;
    if (match?.id) return match.id;
    return null;
  }, [lobby?.id, match?.id]);

  const voiceRtc = useMatchWebRTC({
    enabled: FEATURE_SEAT_VIDEO || FEATURE_AUDIO_ONLY,
    transport,
    myPlayerId: me?.id ?? null,
    matchId: match?.id ?? null,
    lobbyId: lobby?.id ?? null,
    voiceRoomId: voiceScopeId,
  });

  const voiceParticipantKey = useMemo(() => {
    const ids = voiceRtc.participantIds ?? [];
    return ids.length > 0 ? ids.join('|') : '';
  }, [voiceRtc.participantIds]);

  const voiceParticipantIds = useMemo(() => {
    if (!voiceParticipantKey) return [] as string[];
    return voiceParticipantKey.split('|').filter(Boolean);
  }, [voiceParticipantKey]);

  const voiceParticipantIdSet = useMemo(() => {
    return new Set(voiceParticipantIds);
  }, [voiceParticipantIds]);

  const previousVoiceParticipantCountRef = useRef<number>(voiceParticipantIds.length);

  const voiceFeatureEnabled = voiceRtc.featureEnabled;
  const voiceState = voiceRtc.state;
  const voiceJoin = voiceRtc.join;

  const attemptVoiceJoin = useCallback(() => {
    if (!voiceFeatureEnabled) return;
    // Join the voice room (announce presence) but don't auto-connect
    if (voiceState === "idle" || voiceState === "failed" || voiceState === "closed") {
      void voiceJoin();
    }
  }, [voiceFeatureEnabled, voiceJoin, voiceState]);

  const attemptVoiceConnection = useCallback(() => {
    if (!voiceFeatureEnabled) return;
    // Initiate actual WebRTC connection after approval
    if (voiceState === "idle" || voiceState === "failed" || voiceState === "closed") {
      void voiceRtc.initiateConnection();
    }
  }, [voiceFeatureEnabled, voiceRtc, voiceState]);

  const requestVoiceConnection = useCallback(
    (targetId: string) => {
      if (!transport || !voiceFeatureEnabled || !targetId) return;
      if (me?.id && targetId === me.id) return;
      if (voiceParticipantIdSet.has(targetId)) {
        return;
      }
      if (
        outgoingVoiceRequest &&
        ["sending", "pending"].includes(outgoingVoiceRequest.status) &&
        outgoingVoiceRequest.targetId === targetId
      ) {
        return;
      }

      const base: VoiceOutgoingRequest = {
        requestId: null,
        targetId,
        lobbyId: lobby?.id ?? null,
        matchId: match?.id ?? null,
        status: "sending",
        timestamp: Date.now(),
      };

      setOutgoingVoiceRequest(base);
      setVoicePlaybackEnabled(true);

      try {
        transport.emit("rtc:request", {
          targetId,
          lobbyId: lobby?.id ?? null,
          matchId: match?.id ?? null,
        });
      } catch (error) {
        console.warn("rtc:request emit failed", error);
        setOutgoingVoiceRequest({
          ...base,
          status: "cancelled",
          timestamp: Date.now(),
        });
      }
    },
    [
      transport,
      voiceFeatureEnabled,
      me?.id,
      outgoingVoiceRequest,
      lobby?.id,
      match?.id,
      voiceParticipantIdSet,
    ]
  );

  const respondToVoiceRequest = useCallback(
    (requestId: string, requesterId: string, accepted: boolean) => {
      if (!transport) return;
      let snapshot: VoiceIncomingRequest | null = null;

      setIncomingVoiceRequest((current) => {
        if (current && current.requestId === requestId) {
          snapshot = current;
          return null;
        }
        return current;
      });

      try {
        transport.emit("rtc:request:respond", {
          requestId,
          requesterId,
          accepted,
        });
        if (accepted) {
          setVoicePlaybackEnabled(true);
        }
      } catch (error) {
        console.warn("rtc:request:respond emit failed", error);
        if (snapshot) {
          setIncomingVoiceRequest(snapshot);
        }
        return;
      }

      if (accepted && voiceRtc.state !== "connected") {
        // Join the room first if not already joined
        attemptVoiceJoin();
        // Then initiate the WebRTC connection
        attemptVoiceConnection();
      }
    },
    [transport, attemptVoiceJoin, attemptVoiceConnection, setVoicePlaybackEnabled, voiceRtc.state]
  );

  const dismissOutgoingRequest = useCallback(() => {
    setOutgoingVoiceRequest((prev) => {
      if (!prev) return prev;
      if (["declined", "cancelled", "accepted"].includes(prev.status)) {
        return null;
      }
      return prev;
    });
  }, []);

  const clearIncomingRequest = useCallback(() => {
    setIncomingVoiceRequest(null);
  }, []);

  useEffect(() => {
    const previousCount = previousVoiceParticipantCountRef.current;
    const currentCount = voiceParticipantIds.length;

    if (currentCount > 0 && previousCount === 0 && !voicePlaybackEnabled) {
      setVoicePlaybackEnabled(true);
    }

    previousVoiceParticipantCountRef.current = currentCount;
  }, [voiceParticipantIds, voicePlaybackEnabled, setVoicePlaybackEnabled]);

  const knownVoicePeers = useMemo(() => {
    const map = new Map<string, VoiceRequestPeer>();
    if (Array.isArray(lobby?.players)) {
      lobby?.players.forEach((p) => {
        map.set(p.id, { id: p.id, displayName: p.displayName });
      });
    }
    players.forEach((p) => {
      if (!map.has(p.id)) {
        map.set(p.id, { id: p.id, displayName: p.displayName });
      }
    });
    if (me) {
      map.set(me.id, { id: me.id, displayName: me.displayName ?? me.id });
    }
    return map;
  }, [lobby?.players, players, me]);

  const voiceConnectedPeers = useMemo(() => {
    return voiceParticipantIds
      .map((id) => {
        const existing = knownVoicePeers.get(id);
        if (existing) return existing;
        return { id, displayName: `Player ${id.slice(-4)}` };
      })
      .filter((peer, index, self) => peer.id && self.findIndex((p) => p.id === peer.id) === index);
  }, [voiceParticipantIds, knownVoicePeers]);

  const voice = useMemo(
    () => ({
      enabled: FEATURE_AUDIO_ONLY && voiceFeatureEnabled,
      playbackEnabled: voicePlaybackEnabled,
      setPlaybackEnabled: setVoicePlaybackEnabled,
      togglePlayback: toggleVoicePlayback,
      rtc: voiceRtc,
      requestConnection: requestVoiceConnection,
      respondToRequest: respondToVoiceRequest,
      dismissOutgoingRequest,
      clearIncomingRequest,
      incomingRequest: incomingVoiceRequest,
      outgoingRequest: outgoingVoiceRequest,
      connectedPeerIds: voiceParticipantIds,
      connectedPeers: voiceConnectedPeers,
    }),
    [
      voiceRtc,
      voiceFeatureEnabled,
      voicePlaybackEnabled,
      toggleVoicePlayback,
      requestVoiceConnection,
      respondToVoiceRequest,
      dismissOutgoingRequest,
      clearIncomingRequest,
      incomingVoiceRequest,
      outgoingVoiceRequest,
      voiceParticipantIds,
      voiceConnectedPeers,
    ]
  );

  useEffect(() => {
    if (!transport) return;

    const handleVoiceRequest = (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const data = payload as {
        requestId?: string;
        from?: { id?: string; displayName?: string | null };
        lobbyId?: string | null;
        matchId?: string | null;
        timestamp?: number;
      };
      if (!data.requestId || !data.from || !data.from.id) return;
      const fallbackName =
        typeof data.from.displayName === "string" && data.from.displayName.trim().length > 0
          ? data.from.displayName
          : `Player ${String(data.from.id).slice(-4)}`;

      setIncomingVoiceRequest({
        requestId: data.requestId,
        from: {
          id: String(data.from.id),
          displayName: fallbackName,
        },
        lobbyId: data.lobbyId ?? null,
        matchId: data.matchId ?? null,
        timestamp: typeof data.timestamp === "number" ? data.timestamp : Date.now(),
      });
    };

    const handleVoiceRequestSent = (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const data = payload as {
        requestId?: string;
        targetId?: string;
        lobbyId?: string | null;
        matchId?: string | null;
        timestamp?: number;
      };
      const requestId = data.requestId;
      if (!requestId) return;
      setOutgoingVoiceRequest((prev) => {
        if (!prev) return prev;
        const resolvedTarget = data.targetId ? String(data.targetId) : prev.targetId;
        if (prev.targetId !== resolvedTarget) return prev;
        return {
          requestId,
          targetId: resolvedTarget,
          lobbyId: data.lobbyId ?? prev.lobbyId,
          matchId: data.matchId ?? prev.matchId,
          status: "pending",
          timestamp: typeof data.timestamp === "number" ? data.timestamp : Date.now(),
        };
      });
    };

    const handleVoiceAccepted = (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const data = payload as {
        requestId?: string;
        from?: { id?: string };
        lobbyId?: string | null;
        matchId?: string | null;
        timestamp?: number;
      };
      if (!data.from || !data.from.id) return;
      const responderId = String(data.from.id);
      setOutgoingVoiceRequest((prev) => {
        if (!prev) return prev;
        const matchesId = prev.targetId === responderId;
        const matchesRequest = data.requestId ? prev.requestId === data.requestId : matchesId;
        if (!matchesId && !matchesRequest) return prev;
        return {
          requestId: data.requestId ?? prev.requestId ?? null,
          targetId: prev.targetId,
          lobbyId: data.lobbyId ?? prev.lobbyId,
          matchId: data.matchId ?? prev.matchId,
          status: "accepted",
          timestamp: typeof data.timestamp === "number" ? data.timestamp : Date.now(),
        };
      });
      setVoicePlaybackEnabled(true);
      // Join the room first if not already joined
      attemptVoiceJoin();
      // Then initiate the WebRTC connection
      attemptVoiceConnection();
    };

    const handleVoiceDeclined = (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const data = payload as {
        requestId?: string;
        from?: { id?: string };
        lobbyId?: string | null;
        matchId?: string | null;
        timestamp?: number;
      };
      if (!data.from || !data.from.id) return;
      const responderId = String(data.from.id);
      setOutgoingVoiceRequest((prev) => {
        if (!prev) return prev;
        const matchesId = prev.targetId === responderId;
        const matchesRequest = data.requestId ? prev.requestId === data.requestId : matchesId;
        if (!matchesId && !matchesRequest) return prev;
        return {
          requestId: data.requestId ?? prev.requestId ?? null,
          targetId: prev.targetId,
          lobbyId: data.lobbyId ?? prev.lobbyId,
          matchId: data.matchId ?? prev.matchId,
          status: "declined",
          timestamp: typeof data.timestamp === "number" ? data.timestamp : Date.now(),
        };
      });
    };

    const handleVoiceAck = (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const data = payload as {
        requestId?: string;
        accepted?: boolean;
      };
      if (!data.requestId) return;
      setIncomingVoiceRequest((prev) => {
        if (!prev || prev.requestId !== data.requestId) return prev;
        return null;
      });
      if (data.accepted) {
        // Join the room first if not already joined
        attemptVoiceJoin();
        // Then initiate the WebRTC connection (this will be no-op if already connected)
        attemptVoiceConnection();
      }
    };

    const handleVoiceCancelled = (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const data = payload as {
        requestId?: string;
        lobbyId?: string | null;
        matchId?: string | null;
        timestamp?: number;
      };
      if (!data.requestId) return;
      setOutgoingVoiceRequest((prev) => {
        if (!prev) return prev;
        if (prev.requestId && prev.requestId !== data.requestId) return prev;
        return {
          requestId: data.requestId ?? prev.requestId ?? null,
          targetId: prev.targetId,
          lobbyId: data.lobbyId ?? prev.lobbyId,
          matchId: data.matchId ?? prev.matchId,
          status: "cancelled",
          timestamp: typeof data.timestamp === "number" ? data.timestamp : Date.now(),
        };
      });
      setIncomingVoiceRequest((prev) => {
        if (prev && prev.requestId === data.requestId) {
          return null;
        }
        return prev;
      });
    };

    transport.onGeneric("rtc:request", handleVoiceRequest);
    transport.onGeneric("rtc:request:sent", handleVoiceRequestSent);
    transport.onGeneric("rtc:request:accepted", handleVoiceAccepted);
    transport.onGeneric("rtc:request:declined", handleVoiceDeclined);
    transport.onGeneric("rtc:request:ack", handleVoiceAck);
    transport.onGeneric("rtc:request:cancelled", handleVoiceCancelled);

    return () => {
      transport.offGeneric("rtc:request", handleVoiceRequest);
      transport.offGeneric("rtc:request:sent", handleVoiceRequestSent);
      transport.offGeneric("rtc:request:accepted", handleVoiceAccepted);
      transport.offGeneric("rtc:request:declined", handleVoiceDeclined);
      transport.offGeneric("rtc:request:ack", handleVoiceAck);
      transport.offGeneric("rtc:request:cancelled", handleVoiceCancelled);
    };
  }, [transport, attemptVoiceJoin, attemptVoiceConnection]);

  useEffect(() => {
    setIncomingVoiceRequest(null);
    setOutgoingVoiceRequest(null);
  }, [lobby?.id, match?.id]);

  useEffect(() => {
    if (voiceState === "connected") {
      setOutgoingVoiceRequest(null);
      setVoicePlaybackEnabled(true);
    }
  }, [voiceState]);

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
    lobbyRef.current = lobby;
  }, [lobby]);

  useEffect(() => {
    matchRef.current = match;
  }, [match]);

  useEffect(() => {
    // Only connect if the user is authenticated and has a display name (previous behavior)
    if (sessionStatus !== "authenticated" || !session?.user?.name) {
      return;
    }

    const user = session.user as { id?: string | null; name?: string | null; email?: string | null; image?: string | null; };

    if (!user.id) {
      console.error("User ID is missing from session, cannot connect to online services.");
      return;
    }

    const unsubscribers: Array<() => void> = [];

    (async () => {
      try {
        await transport.connect({
          displayName: user.name ?? 'Player',
          playerId: user.id ?? undefined,
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
          // Also fetch HTTP available players list (rich data) initial page
          requestAvailablePlayersRef.current?.({ reset: true });
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
        // Failsafe: if our current joined lobby is missing or no longer lists us, clear local lobby state
        try {
          const curr = lobbyRef.current;
          if (curr) {
            const inList = p.lobbies.find((l) => l.id === curr.id);
            const meNow = meRef.current;
            const stillMember = inList ? inList.players.some((pl) => pl.id === (meNow?.id || "")) : false;
            if (!inList || !stillMember) {
              setLobby(null);
              setReady(false);
            }
          }
        } catch {}
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
        const patch = p.patch as Record<string, unknown>;
        console.log("[statePatch] Received patch:", {
          hasD20Rolls: !!patch.d20Rolls,
          d20Rolls: patch.d20Rolls,
          setupWinner: patch.setupWinner,
          phase: patch.phase,
          keys: Object.keys(patch)
        });
        try {
          const endedFlag =
            Object.prototype.hasOwnProperty.call(patch, "matchEnded") &&
            Boolean((patch as { matchEnded?: unknown }).matchEnded);
          if (endedFlag) {
            setMatch((prev) => {
              if (!prev) return prev;
              if (prev.status === "ended") return prev;
              return { ...prev, status: "ended" } as MatchInfo;
            });
          }
        } catch {}
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
            // Apply server snapshot as a full replacement using __replaceKeys
            // This avoids race conditions where patches arrive between reset and apply
            console.log("[game] Applying server snapshot with full replacement");
            const gameSnapshot = snap.game as Record<string, unknown>;
            const replaceKeys = Object.keys(gameSnapshot);
            const snapshotWithReplace = {
              ...gameSnapshot,
              __replaceKeys: replaceKeys
            };

            queueServerPatch(
              snapshotWithReplace,
              typeof snap.t === "number" ? snap.t : undefined
            );
          } catch (e) {
            console.warn("Failed to apply resync game snapshot", e);
          }
        }
        // Debug: report whether we applied the snapshot
        try {
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
            } catch {}
            setResyncing(false);
          });
        } catch {
          if (resyncGenRef.current === gen) {
            try {
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
      transport.on("matchEnded", (p) => {
        console.log("[online] Match ended", p);
        const currMatch = matchRef.current;
        if (currMatch && p.matchId === currMatch.id) {
          setMatch((prev) => {
            if (!prev || prev.id !== currMatch.id) return prev;
            const next: MatchInfo & Record<string, unknown> = { ...prev, status: "ended" };
            if (p && typeof p === "object" && "winnerId" in p && p.winnerId) {
              next.winnerId = (p as { winnerId: string }).winnerId;
            }
            if (p && typeof p === "object" && "result" in p) {
              const resultValue = (p as { result?: unknown }).result;
              if (
                resultValue === "win" ||
                resultValue === "loss" ||
                resultValue === "draw"
              ) {
                next.result = resultValue;
              } else if (resultValue === null) {
                next.result = null;
              }
            }
            return next as MatchInfo;
          });
          useGameStore.getState().log(`Match ended: ${p.reason || "unknown reason"}`);
        }
      }),
      transport.on("error", (p) => {
        console.warn("server error", p);
        try {
          const code = (p as { code?: string })?.code || '';
          const msg = (p as { message?: string })?.message || '';
          if (code === 'not_host') {
            setSocialError('Only the host can invite');
          } else if (code === 'private_lobby') {
            setSocialError('Lobby is private. You need an invite.');
          } else if (code === 'target_in_match') {
            setSocialError('Target is currently in a match');
          } else if (msg && (msg.toLowerCase().includes('invite') || msg.toLowerCase().includes('host'))) {
            setSocialError(msg);
          }
          if (socialErrorTimer.current) window.clearTimeout(socialErrorTimer.current);
          socialErrorTimer.current = window.setTimeout(() => setSocialError(null), 3000);
        } catch {}
      })
    );

    return () => {
      unsubscribers.forEach((u) => u());
      transport.disconnect();
      setConnected(false);
      setLobbies([]);
      setPlayers([]);
      setInvites([]);
    };
  }, [transport, session, sessionStatus]);


  // HTTP available players fetcher
  const requestAvailablePlayers = useCallback((opts?: { q?: string; sort?: "recent" | "alphabetical"; cursor?: string | null; reset?: boolean }) => {
    const origin = getSocketHttpOrigin();
    const q = opts?.q ?? availableQueryRef.current?.q ?? '';
    const sort: 'recent' | 'alphabetical' = (opts?.sort ?? availableQueryRef.current?.sort ?? 'recent') as 'recent' | 'alphabetical';
    const cursor = opts?.reset ? null : (opts?.cursor ?? availablePlayersNextCursor ?? null);
    availableQueryRef.current = { q, sort };

    (async () => {
      try {
        setAvailablePlayersLoading(true);
        setAvailablePlayersError(null);
        const url = new URL('/players/available', origin);
        if (q) url.searchParams.set('q', q);
        if (sort) url.searchParams.set('sort', sort);
        if (cursor) url.searchParams.set('cursor', cursor);
        url.searchParams.set('limit', '100');
        // Build headers including Authorization Bearer from /api/socket-token (cached ~60s)
        const headers: HeadersInit = { accept: 'application/json' };
        try {
          const now = Date.now();
          if (!availableAuthRef.current || (now - availableAuthRef.current.ts) > 60_000) {
            const tokRes = await fetch('/api/socket-token');
            if (tokRes.ok) {
              const tokJson = await tokRes.json();
              if (tokJson && typeof tokJson.token === 'string') {
                availableAuthRef.current = { token: tokJson.token, ts: now };
              }
            }
          }
          if (availableAuthRef.current?.token) {
            (headers as Record<string, string>).Authorization = `Bearer ${availableAuthRef.current.token}`;
          }
        } catch {}
        const res = await fetch(url.toString(), { method: 'GET', headers });
        if (!res.ok) {
          throw new Error(`Failed to fetch players (${res.status})`);
        }
        const data = await res.json();
        const items: AvailablePlayer[] = Array.isArray(data?.items) ? data.items : [];
        const next: string | null = data?.nextCursor ?? null;
        setAvailablePlayers((prev) => {
          const base = opts?.reset ? [] as AvailablePlayer[] : prev;
          const seen = new Set(base.map((p) => p.userId));
          const merged: AvailablePlayer[] = [...base];
          for (const it of items) {
            if (!seen.has(it.userId)) {
              seen.add(it.userId);
              merged.push(it);
            }
          }
          return merged;
        });
        setAvailablePlayersNextCursor(next);
      } catch (e) {
        console.warn('[online] requestPlayers failed', e);
        const msg = e instanceof Error ? e.message : 'Failed to fetch players';
        setAvailablePlayersError(msg);
      } finally {
        setAvailablePlayersLoading(false);
      }
    })();
  }, [availablePlayersNextCursor, getSocketHttpOrigin]);

  // Stable ref to avoid re-subscribing socket handlers when pagination state changes
  const requestAvailablePlayersRef = useRef<typeof requestAvailablePlayers | null>(null);
  useEffect(() => {
    requestAvailablePlayersRef.current = requestAvailablePlayers;
  }, [requestAvailablePlayers]);

  const ctxValue: OnlineContextValue = {
    transport,
    connected,
    displayName: session?.user?.name || "",
    setDisplayName: () => {}, // No-op, handled by AuthButton
    me,
    lobby,
    match,
    ready,
    toggleReady: () => {
      // One-way ready: players cannot unready. If already ready, ignore.
      if (ready) return;
      setReady(true);
      try {
        transport.ready(true);
      } catch {}
    },
    joinLobby: async (id?: string) => {
      await transport.joinLobby(id);
      // Reset local ready state on lobby join; server updates will resync this shortly
      setReady(false);
    },
    createLobby: async (options?: { name?: string; visibility?: LobbyVisibility; maxPlayers?: number }) => {
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
      try {
        transport.startMatch(matchConfig);
      } catch {}
    },
    joinMatch: async (id: string) => {
      try {
        // Clear any previously declined rejoin flag for this match
        try {
          const key = `sorcery:declinedRejoin:${id}`;
          localStorage.removeItem(key);
        } catch {}
        await transport.joinMatch(id);
      } catch {
        // Simple retry and resync to mitigate transient race conditions
        try {
          setTimeout(() => {
            transport.joinMatch(id).catch(() => {});
          }, 800);
          setTimeout(() => {
            transport.resync();
          }, 1200);
        } catch {}
      }
    },
    leaveMatch: () => {
      try {
        transport.leaveMatch();
      } catch {}
      setMatch(null);
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
      } catch {}
      try {
        transport.resync();
      } catch {}
      // Fallback safety: clear resyncing if server doesn't respond, but only if no newer resync started
      try {
        setTimeout(() => {
          if (resyncGenRef.current !== gen) {
            try {
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
    availablePlayers,
    availablePlayersNextCursor,
    availablePlayersLoading,
    playersError: availablePlayersError ?? socialError,
    invites,
    requestLobbies: () => {
      try {
        transport.requestLobbies();
      } catch {}
    },
    requestPlayers: requestAvailablePlayers,
    setLobbyVisibility: (visibility: LobbyVisibility) => {
      try {
        transport.setLobbyVisibility(visibility);
      } catch {}
    },
    setLobbyPlan: (planned) => {
      try {
        if (transport.setLobbyPlan) transport.setLobbyPlan(planned);
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
    addCpuBot: (displayName?: string) => {
      try {
        if (transport.addCpuBot) transport.addCpuBot(displayName);
      } catch {}
    },
    removeCpuBot: (playerId?: string) => {
      try {
        if (transport.removeCpuBot) transport.removeCpuBot(playerId);
      } catch {}
    },
    voice,
  };

  return (
    <OnlineContext.Provider value={ctxValue}>
      {children}
      {connToast && (
        <div className="fixed top-3 right-3 z-[3000] bg-red-600/90 text-white text-sm px-3 py-2 rounded shadow ring-1 ring-white/20">
          {connToast}
        </div>
      )}
    </OnlineContext.Provider>
  );
}
