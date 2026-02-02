"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { OnlineContext } from "@/app/online/online-context";
import type {
  OnlineContextValue,
  AvailablePlayer,
  VoiceIncomingRequest,
  VoiceOutgoingRequest,
  VoiceRequestPeer,
} from "@/app/online/online-context";
import { useLoadingContext } from "@/lib/contexts/LoadingContext";
import { FEATURE_AUDIO_ONLY, FEATURE_SEAT_VIDEO } from "@/lib/flags";
import { PLAYER_COLORS } from "@/lib/game/constants";
import { useGameStore } from "@/lib/game/store";
import type {
  LobbyInfo,
  MatchInfo,
  ServerChatPayloadT,
  PlayerInfo,
  LobbyInvitePayloadT,
  LobbyVisibility,
  ChatScope,
  MatchmakingStatus,
  MatchmakingPreferences,
  MatchmakingUpdatePayloadT,
} from "@/lib/net/protocol";
import { fetchSocketToken } from "@/lib/net/socketTokenCache";
import { SocketTransport } from "@/lib/net/socketTransport";
import type { StartMatchConfig } from "@/lib/net/transport";
import { notifyPlayerJoinedLobby } from "@/lib/notifications/browserNotifications";
import { useMatchWebRTC } from "@/lib/rtc/useMatchWebRTC";

// Helper to parse [p1:Name], [p2:Name], [card:Name], and [p1card:Name]/[p2card:Name] markup into styled spans
function renderColoredText(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // Match [p1:Name], [p2:Name], [card:Name], [p1card:Name], or [p2card:Name]
  const regex = /\[(p[12]|card|p[12]card):([^\]]+)\]/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const tag = match[1];
    const name = match[2];
    if (tag === "card") {
      // Card name in fantasy font (no color)
      parts.push(
        <span key={key++} className="font-fantaisie">
          {name}
        </span>,
      );
    } else if (tag === "p1card" || tag === "p2card") {
      // Card name with player color and fantasy font
      const color = tag === "p1card" ? PLAYER_COLORS.p1 : PLAYER_COLORS.p2;
      parts.push(
        <span
          key={key++}
          style={{ color, fontFamily: "var(--font-fantaisie, inherit)" }}
        >
          {name}
        </span>,
      );
    } else {
      // Player name with color (p1 or p2)
      const playerNum = tag === "p1" ? "1" : "2";
      const color = playerNum === "1" ? PLAYER_COLORS.p1 : PLAYER_COLORS.p2;
      parts.push(
        <span
          key={key++}
          style={{ color, fontFamily: "var(--font-fantaisie, inherit)" }}
        >
          {name}
        </span>,
      );
    }
    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

export default function OnlineProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Skip applying server patches on hotseat page to avoid overwriting local state
  const isHotseatPage = pathname === "/play";
  const { startLoading: startGlobalLoading, stopLoading: stopGlobalLoading } =
    useLoadingContext();
  const { data: session, status: sessionStatus } = useSession();
  const [connected, setConnected] = useState<boolean>(false);
  const [lobby, setLobby] = useState<LobbyInfo | null>(null);
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [ready, setReady] = useState<boolean>(false);
  const [chatLog, setChatLog] = useState<ServerChatPayloadT[]>([]);
  const [chatHasMore, setChatHasMore] = useState<boolean>(false);
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const [chatOldestIndex, setChatOldestIndex] = useState<number>(0);
  const [me, setMe] = useState<PlayerInfo | null>(null);
  const [lobbies, setLobbies] = useState<LobbyInfo[]>([]);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  // HTTP-available players list (rich data)
  const [availablePlayers, setAvailablePlayers] = useState<AvailablePlayer[]>(
    [],
  );
  const [availablePlayersNextCursor, setAvailablePlayersNextCursor] = useState<
    string | null
  >(null);
  const [availablePlayersLoading, setAvailablePlayersLoading] =
    useState<boolean>(false);
  const availableQueryRef = useRef<{
    q?: string;
    sort?: "recent" | "alphabetical";
  } | null>(null);
  // Cache a short-lived auth token for prioritization (JWT signed by NextAuth)
  const _availableAuthRef = useRef<{ token: string; ts: number } | null>(null);
  const [invites, setInvites] = useState<LobbyInvitePayloadT[]>([]);
  const [availablePlayersError, setAvailablePlayersError] = useState<
    string | null
  >(null);
  const [socialError, setSocialError] = useState<string | null>(null);
  const socialErrorTimer = useRef<number | null>(null);
  const [connToast, setConnToast] = useState<{
    message: string;
    tone: "info" | "error";
  } | null>(null);
  const [appToast, setAppToast] = useState<string | null>(null);
  const [resyncing, setResyncing] = useState<boolean>(false);
  // Matchmaking state
  const [matchmakingStatus, setMatchmakingStatus] =
    useState<MatchmakingStatus>("idle");
  const [matchmakingPreferences, setMatchmakingPreferences] =
    useState<MatchmakingPreferences | null>(null);
  const [matchmakingQueuePosition, setMatchmakingQueuePosition] = useState<
    number | null
  >(null);
  const [matchmakingEstimatedWait, setMatchmakingEstimatedWait] = useState<
    number | null
  >(null);
  const [matchmakingMatchedPlayerId, setMatchmakingMatchedPlayerId] = useState<
    string | null
  >(null);
  const [matchmakingIsHost, setMatchmakingIsHost] = useState<boolean | null>(
    null,
  );
  const [matchmakingQueueSize, setMatchmakingQueueSize] = useState<
    number | null
  >(null);
  const [voicePlaybackEnabled, setVoicePlaybackEnabled] = useState(true);
  const toggleVoicePlayback = useCallback(() => {
    setVoicePlaybackEnabled((prev) => !prev);
  }, []);
  const [incomingVoiceRequest, setIncomingVoiceRequest] =
    useState<VoiceIncomingRequest | null>(null);
  const [outgoingVoiceRequest, setOutgoingVoiceRequest] =
    useState<VoiceOutgoingRequest | null>(null);
  // Track latest "me" across event handlers without re-subscribing
  const meRef = useRef<PlayerInfo | null>(null);
  // Track latest lobby across event handlers
  const lobbyRef = useRef<LobbyInfo | null>(null);
  // Track latest match across event handlers
  const matchRef = useRef<MatchInfo | null>(null);
  // Track which matches we've already logged a start message for (to avoid duplicates)
  const matchStartLoggedRef = useRef<Set<string>>(new Set());

  const transportRef = useRef<SocketTransport | null>(null);
  const transport = useMemo(() => {
    if (!transportRef.current) transportRef.current = new SocketTransport();
    return transportRef.current;
  }, []);

  // Poll socket connection and update connected flag; show a toast on disconnect
  useEffect(() => {
    if (!transport) return;
    let mounted = true;
    let reconnectToastTimer: number | null = null;
    let disconnectToastTimer: number | null = null;

    const readConnectionState = (): string => {
      try {
        const anyT = transport as unknown as {
          isConnected?: () => boolean;
          getConnectionState?: () => string;
        };
        if (anyT?.getConnectionState) return anyT.getConnectionState();
        if (anyT?.isConnected && anyT.isConnected()) return "connected";
      } catch {}
      return "disconnected";
    };

    const showConnToast = (
      message: string,
      tone: "info" | "error",
      duration = 4000,
    ) => {
      setConnToast({ message, tone });
      window.setTimeout(() => {
        if (mounted) setConnToast(null);
      }, duration);
    };

    const clearToastTimers = () => {
      if (reconnectToastTimer !== null) {
        window.clearTimeout(reconnectToastTimer);
        reconnectToastTimer = null;
      }
      if (disconnectToastTimer !== null) {
        window.clearTimeout(disconnectToastTimer);
        disconnectToastTimer = null;
      }
    };

    let prevConnected = readConnectionState() === "connected";

    const tick = () => {
      if (!mounted) return;
      const state = readConnectionState();
      const nowConnected = state === "connected";
      if (nowConnected !== prevConnected) {
        prevConnected = nowConnected;
        setConnected(nowConnected);
        if (!nowConnected) {
          clearToastTimers();
          reconnectToastTimer = window.setTimeout(() => {
            if (!mounted || prevConnected) return; // Reconnected in the meantime
            showConnToast("Reconnecting to Server", "info");
          }, 3000);
          disconnectToastTimer = window.setTimeout(() => {
            if (!mounted || prevConnected) return;
            if (readConnectionState() !== "connected") {
              showConnToast("Disconnected from Server", "error");
            }
          }, 15000);
        } else {
          clearToastTimers();
          setConnToast(null);
        }
      }
    };

    const id = window.setInterval(tick, 1000);
    tick();
    return () => {
      mounted = false;
      clearToastTimers();
      window.clearInterval(id);
    };
  }, [transport]);

  const connLoadingActiveRef = useRef<boolean>(false);
  const connLoadingTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (sessionStatus !== "authenticated") {
      if (connLoadingTimerRef.current) {
        window.clearTimeout(connLoadingTimerRef.current);
        connLoadingTimerRef.current = null;
      }
      if (connLoadingActiveRef.current) {
        stopGlobalLoading();
        connLoadingActiveRef.current = false;
      }
      return;
    }
    if (!connected) {
      if (connLoadingTimerRef.current) {
        window.clearTimeout(connLoadingTimerRef.current);
      }
      connLoadingTimerRef.current = window.setTimeout(() => {
        startGlobalLoading();
        connLoadingActiveRef.current = true;
      }, 300);
    } else {
      if (connLoadingTimerRef.current) {
        window.clearTimeout(connLoadingTimerRef.current);
        connLoadingTimerRef.current = null;
      }
      if (connLoadingActiveRef.current) {
        stopGlobalLoading();
        connLoadingActiveRef.current = false;
      }
    }
    return () => {
      if (connLoadingTimerRef.current) {
        window.clearTimeout(connLoadingTimerRef.current);
        connLoadingTimerRef.current = null;
      }
    };
  }, [connected, sessionStatus, startGlobalLoading, stopGlobalLoading]);

  // Resolve the HTTP origin for the Socket server (for REST-like endpoints)
  const getSocketHttpOrigin = useCallback((): string => {
    const explicit = (process.env.NEXT_PUBLIC_WS_HTTP_ORIGIN || "").trim();
    if (explicit) return explicit;

    const wsUrl = (process.env.NEXT_PUBLIC_WS_URL || "").trim();
    if (wsUrl) {
      if (wsUrl.startsWith("ws://"))
        return wsUrl.replace(/^ws:\/\//, "http://");
      if (wsUrl.startsWith("wss://"))
        return wsUrl.replace(/^wss:\/\//, "https://");
      if (wsUrl.startsWith("http://") || wsUrl.startsWith("https://"))
        return wsUrl;
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
    return ids.length > 0 ? ids.join("|") : "";
  }, [voiceRtc.participantIds]);

  const voiceParticipantIds = useMemo(() => {
    if (!voiceParticipantKey) return [] as string[];
    return voiceParticipantKey.split("|").filter(Boolean);
  }, [voiceParticipantKey]);

  const voiceParticipantIdSet = useMemo(() => {
    return new Set(voiceParticipantIds);
  }, [voiceParticipantIds]);

  const previousVoiceParticipantCountRef = useRef<number>(
    voiceParticipantIds.length,
  );

  const voiceFeatureEnabled = voiceRtc.featureEnabled;
  const voiceState = voiceRtc.state;
  const voiceJoin = voiceRtc.join;

  const attemptVoiceJoin = useCallback(() => {
    if (!voiceFeatureEnabled) return;
    // Join the voice room (announce presence) but don't auto-connect
    if (
      voiceState === "idle" ||
      voiceState === "failed" ||
      voiceState === "closed"
    ) {
      void voiceJoin();
    }
  }, [voiceFeatureEnabled, voiceJoin, voiceState]);

  const attemptVoiceConnection = useCallback(() => {
    if (!voiceFeatureEnabled) return;
    // Initiate actual WebRTC connection after approval
    if (
      voiceState === "idle" ||
      voiceState === "failed" ||
      voiceState === "closed"
    ) {
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
    ],
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
    [
      transport,
      attemptVoiceJoin,
      attemptVoiceConnection,
      setVoicePlaybackEnabled,
      voiceRtc.state,
    ],
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
      .filter(
        (peer, index, self) =>
          peer.id && self.findIndex((p) => p.id === peer.id) === index,
      );
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
    ],
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
        typeof data.from.displayName === "string" &&
        data.from.displayName.trim().length > 0
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
        timestamp:
          typeof data.timestamp === "number" ? data.timestamp : Date.now(),
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
        const resolvedTarget = data.targetId
          ? String(data.targetId)
          : prev.targetId;
        if (prev.targetId !== resolvedTarget) return prev;
        return {
          requestId,
          targetId: resolvedTarget,
          lobbyId: data.lobbyId ?? prev.lobbyId,
          matchId: data.matchId ?? prev.matchId,
          status: "pending",
          timestamp:
            typeof data.timestamp === "number" ? data.timestamp : Date.now(),
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
        const matchesRequest = data.requestId
          ? prev.requestId === data.requestId
          : matchesId;
        if (!matchesId && !matchesRequest) return prev;
        return {
          requestId: data.requestId ?? prev.requestId ?? null,
          targetId: prev.targetId,
          lobbyId: data.lobbyId ?? prev.lobbyId,
          matchId: data.matchId ?? prev.matchId,
          status: "accepted",
          timestamp:
            typeof data.timestamp === "number" ? data.timestamp : Date.now(),
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
        const matchesRequest = data.requestId
          ? prev.requestId === data.requestId
          : matchesId;
        if (!matchesId && !matchesRequest) return prev;
        return {
          requestId: data.requestId ?? prev.requestId ?? null,
          targetId: prev.targetId,
          lobbyId: data.lobbyId ?? prev.lobbyId,
          matchId: data.matchId ?? prev.matchId,
          status: "declined",
          timestamp:
            typeof data.timestamp === "number" ? data.timestamp : Date.now(),
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
          timestamp:
            typeof data.timestamp === "number" ? data.timestamp : Date.now(),
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

  const resyncLoadingActiveRef = useRef<boolean>(false);
  const resyncStopDelayRef = useRef<number | null>(null);
  useEffect(() => {
    if (resyncing) {
      if (!resyncLoadingActiveRef.current) {
        startGlobalLoading();
        resyncLoadingActiveRef.current = true;
      }
    } else {
      if (resyncLoadingActiveRef.current) {
        if (resyncStopDelayRef.current) {
          window.clearTimeout(resyncStopDelayRef.current);
        }
        resyncStopDelayRef.current = window.setTimeout(() => {
          stopGlobalLoading();
          resyncLoadingActiveRef.current = false;
        }, 50);
      }
    }
    return () => {
      if (resyncStopDelayRef.current) {
        window.clearTimeout(resyncStopDelayRef.current);
        resyncStopDelayRef.current = null;
      }
    };
  }, [resyncing, startGlobalLoading, stopGlobalLoading]);

  // Monotonic token to guard resync state across overlapping attempts
  const resyncGenRef = useRef<number>(0);

  // Batch incoming server patches to a single RAF to avoid rapid re-entrancy during reconnects
  const patchQueueRef = useRef<Array<{ patch: unknown; t?: number }>>([]);
  const patchFlushScheduledRef = useRef<boolean>(false);
  const queueServerPatch = useCallback(
    (patch: unknown, t?: number) => {
      // Skip applying server patches on hotseat page to avoid overwriting local game state
      if (isHotseatPage) {
        return;
      }
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
    },
    [isHotseatPage],
  );

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

  // Toast handler - placed after refs are declared so they're accessible
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | {
            message?: string;
            cellKey?: string;
            seat?: string;
            isActionToast?: boolean;
          }
        | undefined;
      if (detail?.message) {
        // Check if action notifications are disabled for action toasts
        // Action toasts are those with seat or cellKey (play/draw/move actions)
        const isActionToast =
          detail.isActionToast || detail.seat || detail.cellKey;
        if (isActionToast) {
          try {
            const stored = localStorage.getItem("sorcery:actionNotifications");
            // Default to true if not set
            const actionNotificationsEnabled =
              stored === null ? true : stored === "1";
            if (!actionNotificationsEnabled) return;
          } catch {}
        }

        // Skip toast for the active player (only show to opponent)
        const matchPlayers = matchRef.current?.players;
        const myId = meRef.current?.id;

        if (detail.seat && myId && matchPlayers) {
          const mySeatIndex = matchPlayers.findIndex((p) => p.id === myId);
          const myPlayerKey =
            mySeatIndex === 0 ? "p1" : mySeatIndex === 1 ? "p2" : null;
          if (myPlayerKey && detail.seat === myPlayerKey) {
            // This is my own action, skip the toast
            return;
          }
        }

        // Resolve PLAYER placeholder to actual player name if seat is provided
        let resolvedMessage = detail.message;
        if (detail.seat && matchPlayers) {
          const playerIndex = detail.seat === "p1" ? 0 : 1;
          const playerName =
            matchPlayers[playerIndex]?.displayName || detail.seat.toUpperCase();
          resolvedMessage = resolvedMessage.replace(/PLAYER/g, playerName);
        } else {
          // Fallback to P1/P2 if no match context
          resolvedMessage = resolvedMessage.replace(
            /PLAYER/g,
            detail.seat?.toUpperCase() || "Player",
          );
        }
        setAppToast(resolvedMessage);
        // Dispatch highlight event if cellKey is provided
        if (detail.cellKey) {
          window.dispatchEvent(
            new CustomEvent("app:highlight-cell", {
              detail: { cellKey: detail.cellKey },
            }),
          );
        }
        window.setTimeout(() => {
          setAppToast(null);
          // Clear highlight when toast disappears
          if (detail.cellKey) {
            window.dispatchEvent(
              new CustomEvent("app:highlight-cell", {
                detail: { cellKey: null },
              }),
            );
          }
        }, 3500);
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("app:toast", handler as EventListener);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("app:toast", handler as EventListener);
      }
    };
  }, []);

  useEffect(() => {
    // Only connect if the user is authenticated and has a display name (previous behavior)
    if (sessionStatus !== "authenticated" || !session?.user?.name) {
      return;
    }

    const user = session.user as {
      id?: string | null;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };

    if (!user.id) {
      console.error(
        "User ID is missing from session, cannot connect to online services.",
      );
      return;
    }

    const unsubscribers: Array<() => void> = [];

    (async () => {
      try {
        await transport.connect({
          displayName: user.name ?? "Player",
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
        const prevLobby = lobbyRef.current;
        const you = meRef.current;
        const isHost = you && p.lobby.hostId === you.id;

        // Detect new players joining (only notify host when tab is unfocused)
        if (isHost && prevLobby) {
          const prevPlayerIds = new Set(prevLobby.players.map((pl) => pl.id));
          const newPlayers = p.lobby.players.filter(
            (pl) => !prevPlayerIds.has(pl.id) && pl.id !== you.id,
          );
          for (const newPlayer of newPlayers) {
            const notified = notifyPlayerJoinedLobby(
              newPlayer.displayName,
              p.lobby.name ?? undefined,
            );
            console.log(
              `[Lobby] Player ${newPlayer.displayName} joined. Notification ${
                notified ? "sent" : "skipped (permission not granted)"
              }`,
            );
          }
        }

        setLobby(p.lobby);
        setReady(
          you ? (p.lobby.readyPlayerIds?.includes(you.id) ?? false) : false,
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
            const stillMember = inList
              ? inList.players.some((pl) => pl.id === (meNow?.id || ""))
              : false;
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
        try {
          useGameStore.getState().setMatchId(p.match?.id ?? null);
        } catch {}
        // Log match start
        if (p.match.status === "waiting") {
          try {
            const id = String((p.match as { id?: unknown }).id || "");
            if (id && !matchStartLoggedRef.current.has(id)) {
              matchStartLoggedRef.current.add(id);
              useGameStore
                .getState()
                .log(
                  `Match started with ${p.match.players
                    .map((pl) => pl.displayName)
                    .join(" and ")}`,
                );
            }
          } catch {}
        }
      }),
      // Apply incremental game state patches into the Zustand store
      transport.on("statePatch", (p) => {
        const patch = p.patch as Record<string, unknown>;
        const permanentsData = patch.permanents as
          | Record<string, unknown[]>
          | undefined;
        const permanentsSummary = permanentsData
          ? Object.entries(permanentsData)
              .map(([key, arr]) => {
                const names = arr.map((p: unknown) => {
                  const card = (p as { card?: { name?: string } })?.card;
                  return card?.name || "?";
                });
                return `${key}:[${names.join(", ")}]`;
              })
              .join(", ")
          : undefined;

        console.log("[statePatch] Received patch:", {
          hasD20Rolls: !!patch.d20Rolls,
          d20Rolls: patch.d20Rolls,
          setupWinner: patch.setupWinner,
          phase: patch.phase,
          keys: Object.keys(patch),
          permanentsSummary,
          timestamp: p.t,
        });
        try {
          const endedFlag =
            Object.prototype.hasOwnProperty.call(patch, "matchEnded") &&
            Boolean((patch as { matchEnded?: unknown }).matchEnded);
          if (endedFlag) {
            // Extract match end info from statePatch if present (for redundancy with matchEnded event)
            const patchWinnerId = (patch as { winnerId?: string | null })
              ?.winnerId;
            const patchEndReason = (patch as { endReason?: string })?.endReason;
            const patchRated = (patch as { rated?: boolean })?.rated;
            setMatch((prev) => {
              if (!prev) return prev;
              if (prev.status === "ended" && prev.winnerId) return prev;
              const next: MatchInfo & Record<string, unknown> = {
                ...prev,
                status: "ended",
              };
              // Set winnerId from statePatch if available and not already set
              if (patchWinnerId && !prev.winnerId) {
                next.winnerId = patchWinnerId;
              }
              // Set endReason from statePatch if available
              if (patchEndReason && !prev.endReason) {
                next.endReason = patchEndReason;
              }
              // Set rated from statePatch if available (rated is not in MatchInfo type but added dynamically)
              if (
                typeof patchRated === "boolean" &&
                (prev as Record<string, unknown>).rated === undefined
              ) {
                next.rated = patchRated;
              }
              return next as MatchInfo;
            });
          }
        } catch {}
        queueServerPatch(p.patch, p.t);
      }),
      transport.on("chat", (p) =>
        setChatLog((prev) => {
          // Deduplicate using timestamp if available, otherwise content+sender
          const msgKey = p.ts
            ? `${p.from?.id ?? "system"}:${p.ts}`
            : `${p.from?.id ?? "system"}:${p.content}`;
          const exists = prev.some((m) => {
            const existingKey = m.ts
              ? `${m.from?.id ?? "system"}:${m.ts}`
              : `${m.from?.id ?? "system"}:${m.content}`;
            return existingKey === msgKey;
          });
          if (exists) return prev;
          return [...prev, p];
        }),
      ),
      transport.on("chatHistory", (p) => {
        // Update pagination state and clear loading
        setChatHasMore(p.hasMore);
        setChatOldestIndex(p.oldestIndex);
        setChatLoading(false);
        // Merge server chat history with existing messages, avoiding duplicates
        setChatLog((prev) => {
          const existingKeys = new Set(
            prev.map((m) =>
              m.ts
                ? `${m.from?.id ?? "system"}:${m.ts}`
                : `${m.from?.id ?? "system"}:${m.content}`,
            ),
          );
          const newMessages = p.messages.filter((m) => {
            const key = m.ts
              ? `${m.from?.id ?? "system"}:${m.ts}`
              : `${m.from?.id ?? "system"}:${m.content}`;
            return !existingKeys.has(key);
          });
          if (newMessages.length === 0) return prev;
          // Prepend history (older messages) before current messages
          return [...newMessages, ...prev];
        });
      }),
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
            you
              ? (snap.lobby.readyPlayerIds?.includes(you.id) ?? false)
              : false,
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
              try {
                useGameStore.getState().setMatchId(null);
              } catch {}
              return;
            } else {
              setMatch(snap.match);
              try {
                useGameStore.getState().setMatchId(snap.match?.id ?? null);
              } catch {}
            }
          } catch {
            setMatch(snap.match);
            try {
              useGameStore.getState().setMatchId(snap.match?.id ?? null);
            } catch {}
          }
        } else {
          // No match in snapshot means we're not in a game; do not apply snapshot
          allowApplyGame = false;
          try {
            useGameStore.getState().setMatchId(null);
          } catch {}
        }

        if (!snap?.lobby && !snap?.match) {
          setLobby(null);
          setMatch(null);
          setReady(false);
          allowApplyGame = false;
          try {
            useGameStore.getState().setMatchId(null);
          } catch {}
        }

        // Apply full game snapshot if provided and allowed
        if (allowApplyGame && snap?.game) {
          try {
            // Apply server snapshot - for a full resync, REPLACE all game state keys
            // This is a full snapshot from the server (not a partial patch), so we should
            // replace rather than merge to avoid duplicate permanents causing mana/threshold accumulation
            console.log(
              "[game] Applying server snapshot with full replacement",
            );
            const gameSnapshot = snap.game as Record<string, unknown>;

            // Keys that should be fully replaced during resync (this is a complete snapshot)
            // Note: For incremental patches we don't use __replaceKeys, but for resync we need full replacement
            const safeToReplaceKeys = [
              "phase",
              "currentPlayer",
              "turn",
              "d20Rolls",
              "setupWinner",
              "matchEnded",
              "winner",
              "hasDrawnThisTurn",
              "players",
              "playerPositions",
              "events",
              "eventSeq",
              // Full resync should replace these to avoid duplicate permanents/mana accumulation
              "permanents",
              "board",
              "zones",
              "avatars",
              "mulligans",
              "mulliganDrawn",
              // Avatar-related state that must persist across reloads
              "imposterMasks",
              "pathfinderUsed",
              "druidFlipped",
              "necromancerSkeletonUsed",
            ];

            // Only include keys that exist in the snapshot AND are safe to replace
            const replaceKeys = safeToReplaceKeys.filter(
              (key) => key in gameSnapshot,
            );

            const snapshotWithReplace = {
              ...gameSnapshot,
              __replaceKeys: replaceKeys,
            };

            queueServerPatch(
              snapshotWithReplace,
              typeof snap.t === "number" ? snap.t : undefined,
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
                  { gen, current: resyncGenRef.current },
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
                { gen, current: resyncGenRef.current },
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
            const next: MatchInfo & Record<string, unknown> = {
              ...prev,
              status: "ended",
            };
            if (p && typeof p === "object" && "winnerId" in p && p.winnerId) {
              next.winnerId = (p as { winnerId: string }).winnerId;
            }
            if (
              p &&
              typeof p === "object" &&
              "reason" in p &&
              (p as { reason?: unknown }).reason
            ) {
              next.endReason = (p as { reason?: string }).reason;
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
            if (p && typeof p === "object" && "rated" in p) {
              const ratedValue = (p as { rated?: unknown }).rated;
              if (typeof ratedValue === "boolean") {
                (next as Record<string, unknown>).rated = ratedValue;
              }
            }
            return next as MatchInfo;
          });
          useGameStore
            .getState()
            .log(`Match ended: ${p.reason || "unknown reason"}`);
          try {
            const myId = meRef.current?.id || null;
            let msg: string | null = null;
            const reason = (p as { reason?: string | null })?.reason || null;
            // "forfeit" = explicit player action, "disconnect" = player didn't reconnect
            if (reason === "forfeit" || reason === "disconnect") {
              const winnerId =
                (p as { winnerId?: string | null })?.winnerId || null;
              const ratedRaw = (p as { rated?: boolean | null })?.rated;
              const isRated = ratedRaw !== false;
              if (!isRated) {
                if (myId && winnerId && winnerId === myId) {
                  msg = "Your opponent left early. Match not counted.";
                } else if (myId && winnerId && winnerId !== myId) {
                  msg = "You left the match early. Match not counted.";
                } else {
                  msg = "Match ended early. Not counted for global scores.";
                }
              } else {
                if (myId && winnerId && winnerId === myId) {
                  msg = "Your opponent forfeited. You win.";
                } else if (myId && winnerId && winnerId !== myId) {
                  msg = "You forfeited the match.";
                } else {
                  msg = "Match ended due to forfeit.";
                }
              }
            }
            if (msg) {
              localStorage.setItem("app:toast", msg);
              window.dispatchEvent(
                new CustomEvent("app:toast", { detail: { message: msg } }),
              );
            }
          } catch {}
        }
      }),
      transport.on("error", (p) => {
        console.warn("server error", p);
        try {
          const code = (p as { code?: string })?.code || "";
          const msg = (p as { message?: string })?.message || "";
          if (code === "not_host") {
            setSocialError("Only the host can invite");
          } else if (code === "private_lobby") {
            setSocialError("Lobby is private. You need an invite.");
          } else if (code === "target_in_match") {
            setSocialError("Target is currently in a match");
          } else if (
            msg &&
            (msg.toLowerCase().includes("invite") ||
              msg.toLowerCase().includes("host"))
          ) {
            setSocialError(msg);
          }
          if (socialErrorTimer.current)
            window.clearTimeout(socialErrorTimer.current);
          socialErrorTimer.current = window.setTimeout(
            () => setSocialError(null),
            3000,
          );
        } catch {}
      }),
    );

    // Matchmaking event handler via onGeneric for server-only events
    const handleMatchmakingUpdate = (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const data = payload as MatchmakingUpdatePayloadT;
      setMatchmakingStatus(data.status);
      setMatchmakingPreferences(data.preferences ?? null);
      setMatchmakingQueuePosition(data.queuePosition ?? null);
      setMatchmakingEstimatedWait(data.estimatedWait ?? null);
      setMatchmakingMatchedPlayerId(data.matchedPlayerId ?? null);
      setMatchmakingIsHost(data.isHost ?? null);
      setMatchmakingQueueSize(data.queueSize ?? null);

      // If match was found, auto-navigate to lobby
      if (data.status === "found" && data.lobbyId) {
        console.log("[matchmaking] Match found, joining lobby:", data.lobbyId);
      }
    };
    transport.onGeneric("matchmakingUpdate", handleMatchmakingUpdate);

    const cleanupMatchmaking = () => {
      transport.offGeneric("matchmakingUpdate", handleMatchmakingUpdate);
    };

    return () => {
      cleanupMatchmaking();
      unsubscribers.forEach((u) => u());
      transport.disconnect();
      setConnected(false);
      setLobbies([]);
      setPlayers([]);
      setInvites([]);
      // Reset matchmaking state on cleanup
      setMatchmakingStatus("idle");
      setMatchmakingPreferences(null);
      setMatchmakingQueuePosition(null);
      setMatchmakingEstimatedWait(null);
      setMatchmakingMatchedPlayerId(null);
      setMatchmakingIsHost(null);
      setMatchmakingQueueSize(null);
    };
  }, [transport, session, sessionStatus, queueServerPatch]);

  // Rate limiting for available players fetcher - minimum 10 seconds between requests
  const lastAvailablePlayersRequestRef = useRef<number>(0);
  const AVAILABLE_PLAYERS_MIN_INTERVAL_MS = 10000; // 10 seconds

  // HTTP available players fetcher
  const requestAvailablePlayers = useCallback(
    (opts?: {
      q?: string;
      sort?: "recent" | "alphabetical";
      cursor?: string | null;
      reset?: boolean;
    }) => {
      // Rate limit: skip if last request was too recent (unless it's a pagination request)
      const now = Date.now();
      const timeSinceLastRequest = now - lastAvailablePlayersRequestRef.current;
      if (
        !opts?.cursor &&
        timeSinceLastRequest < AVAILABLE_PLAYERS_MIN_INTERVAL_MS
      ) {
        console.log(
          `[online] requestPlayers rate limited (${Math.round(
            timeSinceLastRequest / 1000,
          )}s since last)`,
        );
        return;
      }
      lastAvailablePlayersRequestRef.current = now;

      const origin = getSocketHttpOrigin();
      const q = opts?.q ?? availableQueryRef.current?.q ?? "";
      const sort: "recent" | "alphabetical" = (opts?.sort ??
        availableQueryRef.current?.sort ??
        "recent") as "recent" | "alphabetical";
      const cursor = opts?.reset
        ? null
        : (opts?.cursor ?? availablePlayersNextCursor ?? null);
      availableQueryRef.current = { q, sort };

      (async () => {
        try {
          setAvailablePlayersLoading(true);
          setAvailablePlayersError(null);
          const url = new URL("/players/available", origin);
          if (q) url.searchParams.set("q", q);
          if (sort) url.searchParams.set("sort", sort);
          if (cursor) url.searchParams.set("cursor", cursor);
          url.searchParams.set("limit", "100");
          // Build headers including Authorization Bearer from shared token cache
          const headers: HeadersInit = { accept: "application/json" };
          try {
            const token = await fetchSocketToken();
            if (token) {
              (headers as Record<string, string>).Authorization =
                `Bearer ${token}`;
            }
          } catch {}
          const res = await fetch(url.toString(), {
            method: "GET",
            headers,
            cache: "no-store",
          });
          if (!res.ok) {
            throw new Error(`Failed to fetch players (${res.status})`);
          }
          const data = await res.json();
          const items: AvailablePlayer[] = Array.isArray(data?.items)
            ? data.items
            : [];
          const next: string | null = data?.nextCursor ?? null;
          setAvailablePlayers((prev) => {
            const base = opts?.reset ? ([] as AvailablePlayer[]) : prev;
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
          console.warn("[online] requestPlayers failed", e);
          const msg =
            e instanceof Error ? e.message : "Failed to fetch players";
          setAvailablePlayersError(msg);
        } finally {
          setAvailablePlayersLoading(false);
        }
      })();
    },
    [availablePlayersNextCursor, getSocketHttpOrigin],
  );

  // Stable ref to avoid re-subscribing socket handlers when pagination state changes
  const requestAvailablePlayersRef = useRef<
    typeof requestAvailablePlayers | null
  >(null);
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
    createLobby: async (options?: {
      name?: string;
      visibility?: LobbyVisibility;
      maxPlayers?: number;
    }) => {
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
        // If leaving an already-ended match, set a local suppression flag
        const m = matchRef.current;
        if (m && m.id && m.status === "ended") {
          try {
            const key = `sorcery:declinedRejoin:${m.id}`;
            localStorage.setItem(key, "1");
          } catch {}
        }
      } catch {}
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
              { gen },
            );
          } catch {}
          setResyncing(false);
        }, 2500);
      } catch {}
    },
    resyncing,
    chatLog,
    chatHasMore,
    chatLoading,
    chatOldestIndex,
    requestMoreChatHistory: () => {
      if (!chatHasMore || chatLoading) return;
      setChatLoading(true);
      try {
        transport.requestChatHistory(chatOldestIndex, 25);
      } catch {
        setChatLoading(false);
      }
    },
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
        prev.filter((i) => !(i.lobbyId === lobbyId && i.from.id === fromId)),
      );
    },
    addCpuBot: (displayName?: string) => {
      try {
        if (transport.addCpuBot) transport.addCpuBot(displayName);
      } catch {}
    },
    startCpuMatch: () => {
      try {
        if (transport.startCpuMatch) transport.startCpuMatch();
      } catch {}
    },
    removeCpuBot: (playerId?: string) => {
      try {
        if (transport.removeCpuBot) transport.removeCpuBot(playerId);
      } catch {}
    },
    voice,
    // Matchmaking state and actions
    matchmaking: {
      status: matchmakingStatus,
      preferences: matchmakingPreferences,
      queuePosition: matchmakingQueuePosition,
      estimatedWait: matchmakingEstimatedWait,
      matchedPlayerId: matchmakingMatchedPlayerId,
      isHost: matchmakingIsHost,
      queueSize: matchmakingQueueSize,
    },
    joinMatchmaking: (
      matchTypes: Array<"constructed" | "sealed" | "draft" | "precon">,
    ) => {
      try {
        transport.emit("joinMatchmaking", { preferences: { matchTypes } });
      } catch {}
    },
    leaveMatchmaking: () => {
      try {
        transport.emit("leaveMatchmaking", {});
      } catch {}
      // Also reset local state immediately for responsiveness
      setMatchmakingStatus("idle");
      setMatchmakingPreferences(null);
      setMatchmakingQueuePosition(null);
      setMatchmakingEstimatedWait(null);
      setMatchmakingMatchedPlayerId(null);
      setMatchmakingIsHost(null);
      setMatchmakingQueueSize(null);
    },
  };

  // Persistent audio element ref for voice chat
  const persistentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Keep persistent audio element in sync with remote stream and playback state
  useEffect(() => {
    const el = persistentAudioRef.current;
    if (!el) return;

    try {
      const remoteStream = voiceRtc.remoteStream;
      if (remoteStream) {
        el.srcObject = remoteStream;
        if (voicePlaybackEnabled) {
          el.muted = false;
          const playPromise = el.play();
          if (playPromise && typeof playPromise.then === "function") {
            playPromise.catch(() => {
              // Autoplay blocked - will resume on user interaction
            });
          }
        } else {
          el.muted = true;
        }
      } else {
        el.pause();
        el.srcObject = null;
      }
    } catch {
      // Ignore errors
    }
  }, [voiceRtc.remoteStream, voicePlaybackEnabled]);

  return (
    <OnlineContext.Provider value={ctxValue}>
      {children}
      {/* Persistent audio element for voice chat - stays mounted regardless of UI state */}
      <audio ref={persistentAudioRef} autoPlay playsInline className="hidden" />
      {connToast && (
        <div
          className={`fixed top-3 right-3 z-[3000] text-white text-sm px-3 py-2 rounded shadow ring-1 ring-white/20 ${
            connToast.tone === "error" ? "bg-red-600/90" : "bg-green-600/90"
          }`}
        >
          {connToast.message}
        </div>
      )}
      {appToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[3000] bg-black/90 text-white text-xl px-6 py-3 rounded-lg shadow-lg ring-2 ring-white/30 font-medium animate-fade-in">
          {renderColoredText(appToast)}
        </div>
      )}
    </OnlineContext.Provider>
  );
}
