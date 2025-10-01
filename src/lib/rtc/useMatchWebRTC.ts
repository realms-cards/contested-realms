'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FEATURE_SEAT_VIDEO, FEATURE_AUDIO_ONLY, RTC_STUN_SERVERS } from '@/lib/flags';
import type { SocketTransport } from '@/lib/net/socketTransport';

export type RtcState =
  | 'idle'
  | 'joining'
  | 'negotiating'
  | 'connected'
  | 'failed'
  | 'closed';

export type UseMatchWebRTCOptions = {
  enabled: boolean;
  transport: SocketTransport | null;
  myPlayerId: string | null;
  matchId: string | null;
  lobbyId?: string | null;
  /**
   * Explicit voice room identifier. When provided, takes precedence over match/lobby ids
   * for determining whether the client is eligible to join voice chat.
   */
  voiceRoomId?: string | null;
  iceServers?: RTCIceServer[];
};

export function useMatchWebRTC(opts: UseMatchWebRTCOptions) {
  const { enabled, transport, myPlayerId, matchId, lobbyId, voiceRoomId } = opts;
  const iceServers = opts.iceServers ?? RTC_STUN_SERVERS;

  const activeScopeId = voiceRoomId ?? matchId ?? lobbyId ?? null;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const remotePeerIdRef = useRef<string | null>(null);
  const previousScopeIdRef = useRef<string | null>(activeScopeId);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const disconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [state, setState] = useState<RtcState>('idle');
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  // Device selection state
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDeviceId, setAudioDeviceId] = useState<string | null>(null);
  const [videoDeviceId, setVideoDeviceId] = useState<string | null>(null);
  const [audioOutputDeviceId, setAudioOutputDeviceId] = useState<string | null>(null);

  const localStream = localStreamRef.current;
  const remoteStream = remoteStreamRef.current;

  const cleanupPc = useCallback(() => {
    try {
      // Clear disconnect timer
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }

      // Clear buffered ICE candidates
      pendingIceCandidatesRef.current = [];

      pcRef.current?.getSenders().forEach((s) => {
        try {
          s.track?.stop();
        } catch (error) {
          console.warn('[RTC] Error stopping sender track:', error);
        }
      });
      pcRef.current?.getReceivers().forEach((r) => {
        try {
          r.track?.stop();
        } catch (error) {
          console.warn('[RTC] Error stopping receiver track:', error);
        }
      });
      pcRef.current?.close();
    } catch (error) {
      console.error('[RTC] Error during peer connection cleanup:', error);
    }
    pcRef.current = null;
  }, []);

  const cleanupStreams = useCallback(() => {
    try {
      localStreamRef.current?.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch (error) {
          console.warn('[RTC] Error stopping local track:', error);
        }
      });
    } catch (error) {
      console.error('[RTC] Error cleaning up streams:', error);
    }
    localStreamRef.current = null;
    remoteStreamRef.current = null;
  }, []);

  const reset = useCallback(() => {
    cleanupPc();
    cleanupStreams();
    remotePeerIdRef.current = null;
    setState('idle');
  }, [cleanupPc, cleanupStreams]);

  const ensurePc = useCallback(() => {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;

    pc.ontrack = (ev) => {
      if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
      const stream = remoteStreamRef.current;
      for (const track of ev.streams?.[0]?.getTracks?.() || []) {
        if (!stream.getTracks().some((t) => t.id === track.id)) {
          stream.addTrack(track);
        }
      }
      setState('connected');
    };

    pc.onicecandidate = (ev) => {
      if (!ev.candidate || !transport) return;
      transport.emit?.('rtc:signal', { data: { candidate: ev.candidate } });
    };

    pc.onconnectionstatechange = () => {
      const cs = pc.connectionState;

      if (cs === 'connected') setState('connected');
      else if (cs === 'failed') setState('failed');
      else if (cs === 'closed' || cs === 'disconnected') {
        setState('closed');
      }
    };

    // Phase 1 Fix: ICE connection state monitoring for better failure detection
    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;

      switch (iceState) {
        case 'checking':
          setState('negotiating');
          break;
        case 'connected':
        case 'completed':
          setState('connected');
          // Clear any disconnect timers
          if (disconnectTimerRef.current) {
            clearTimeout(disconnectTimerRef.current);
            disconnectTimerRef.current = null;
          }
          break;
        case 'failed':
          console.error('[RTC] ICE connection failed, attempting ICE restart');
          setState('failed');
          // Attempt ICE restart
          pc.restartIce();
          break;
        case 'disconnected':
          console.warn('[RTC] ICE connection disconnected, starting recovery timer');
          // Give it 5 seconds to recover before restarting
          if (disconnectTimerRef.current) {
            clearTimeout(disconnectTimerRef.current);
          }
          disconnectTimerRef.current = setTimeout(() => {
            if (pc.iceConnectionState === 'disconnected') {
              console.warn('[RTC] ICE still disconnected after 5s, restarting');
              pc.restartIce();
            }
          }, 5000);
          break;
        case 'closed':
          setState('closed');
          break;
      }
    };

    return pc;
  }, [iceServers, transport]);

  // Device enumeration/refresh
  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = list.filter((d) => d.kind === 'audioinput');
      const videoInputs = list.filter((d) => d.kind === 'videoinput');
      const audioOutputs = list.filter((d) => d.kind === 'audiooutput');
      setAudioDevices(audioInputs);
      setVideoDevices(videoInputs);
      setAudioOutputDevices(audioOutputs);

      // Clear selected device if it's no longer available
      if (audioOutputDeviceId && !audioOutputs.some((d) => d.deviceId === audioOutputDeviceId)) {
        console.warn('[RTC] Selected audio output device no longer available');
        setAudioOutputDeviceId(null);
      }
    } catch (error) {
      console.error('[RTC] Failed to enumerate devices:', error);
    }
  }, [audioOutputDeviceId]);

  useEffect(() => {
    if (!enabled) return;
    refreshDevices().catch(() => {});
    const onDeviceChange = () => refreshDevices();
    try { navigator.mediaDevices.addEventListener('devicechange', onDeviceChange); } catch {}
    return () => {
      try { navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange); } catch {}
    };
  }, [enabled, refreshDevices]);

  const openLocalStream = useCallback(async () => {
    // Build constraints with audio quality optimization
    const audioConstraints: MediaTrackConstraints = {
      ...(audioDeviceId && { deviceId: { exact: audioDeviceId } }),
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: { ideal: 48000 },
      channelCount: { ideal: 1 }, // Mono for voice chat
    };

    const constraints: MediaStreamConstraints = {
      audio: audioConstraints,
      // In audio-only mode, do not request video at all
      video: FEATURE_AUDIO_ONLY ? false : (videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true),
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return stream;
    } catch (primaryError) {
      console.warn('[RTC] Failed with selected devices:', primaryError);

      // Phase 2 Fix: Better fallback with error messaging
      try {
        // Try default devices with quality constraints
        const fallbackConstraints: MediaStreamConstraints = {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: { ideal: 48000 },
            channelCount: { ideal: 1 },
          },
          video: FEATURE_AUDIO_ONLY ? false : true,
        };

        const stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
        console.log('[RTC] Using default devices as fallback');

        // Clear selected devices since they failed
        setAudioDeviceId(null);
        if (!FEATURE_AUDIO_ONLY) {
          setVideoDeviceId(null);
        }

        return stream;
      } catch (fallbackError) {
        console.error('[RTC] All media acquisition attempts failed:', fallbackError);
        throw new Error(`Media acquisition failed: ${(fallbackError as Error).message}`);
      }
    }
  }, [audioDeviceId, videoDeviceId]);

  // Phase 3 Fix: Optimize audio bitrate for voice chat
  const optimizeAudioBitrate = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;

    const senders = pc.getSenders();
    for (const sender of senders) {
      if (sender.track?.kind === 'audio') {
        try {
          const parameters = sender.getParameters();
          if (!parameters.encodings) {
            parameters.encodings = [{}];
          }

          // Set max bitrate for audio (Opus codec optimized for voice)
          parameters.encodings[0].maxBitrate = 32000; // 32 kbps for voice quality

          await sender.setParameters(parameters);
        } catch (error) {
          console.warn('[RTC] Failed to set audio bitrate:', error);
        }
      }
    }
  }, []);

  const addLocalTracks = useCallback(async () => {
    const pc = ensurePc();
    if (!localStreamRef.current) {
      const stream = await openLocalStream();
      localStreamRef.current = stream;
      // After first capture, refresh devices to reveal labels
      refreshDevices().catch(() => {});
    }
    const stream = localStreamRef.current;
    if (!stream) return;
    const existingTracks = new Set(pc.getSenders().map((s) => s.track?.id).filter(Boolean));
    for (const track of stream.getTracks()) {
      if (existingTracks.has(track.id)) {
        continue;
      }
      pc.addTrack(track, stream);
    }

    // Phase 3 Fix: Optimize bitrate after adding tracks
    await optimizeAudioBitrate();
  }, [ensurePc, openLocalStream, refreshDevices, optimizeAudioBitrate]);

  const makeOffer = useCallback(async () => {
    const pc = ensurePc();
    setState('negotiating');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    transport?.emit?.('rtc:signal', { data: { sdp: pc.localDescription } });
  }, [ensurePc, transport]);

  const handleSignal = useCallback(async (payload: unknown) => {
    if (!payload || typeof payload !== 'object') return;
    // expected: { from: string, data: { sdp?: RTCSessionDescriptionInit, candidate?: RTCIceCandidateInit } }
    const obj = payload as { from?: string; data?: unknown };
    const from = typeof obj.from === 'string' ? obj.from : null;
    const data = obj.data;
    if (!data || typeof data !== 'object') return;
    const pc = ensurePc();

    // Track remote id
    if (from) remotePeerIdRef.current = from;

    const d = data as { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };

    try {
      if (d.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(d.sdp));

        // Phase 1 Fix: Flush buffered ICE candidates after remote description is set
        for (const candidate of pendingIceCandidatesRef.current) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (error) {
            console.warn('[RTC] Failed to add buffered ICE candidate:', error);
          }
        }
        pendingIceCandidatesRef.current = [];

        if (d.sdp.type === 'offer') {
          // Answer offer
          await addLocalTracks();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          transport?.emit?.('rtc:signal', { data: { sdp: pc.localDescription } });
        }
      } else if (d.candidate) {
        // Phase 1 Fix: Buffer ICE candidates if remote description not set yet
        if (!pc.remoteDescription) {
          pendingIceCandidatesRef.current.push(d.candidate);
        } else {
          await pc.addIceCandidate(new RTCIceCandidate(d.candidate));
        }
      }
    } catch (error) {
      // Phase 2 Fix: Proper error logging
      console.error('[RTC] Signal handling error:', error);
      setState('failed');
    }
  }, [addLocalTracks, ensurePc, transport]);

  const handlePeerJoined = useCallback(async (payload: unknown) => {
    // expected: { from: { id: string } }
    if (!payload || typeof payload !== 'object') return;
    const obj = payload as { from?: { id?: string } };
    const pid = obj.from?.id ? String(obj.from.id) : null;
    if (!pid || !myPlayerId) return;

    // If we're already in the process of joining/negotiating, don't interfere
    if (state !== 'idle' && state !== 'failed' && state !== 'closed') {
      return;
    }
    remotePeerIdRef.current = pid;
    setParticipantIds((prev) => {
      if (pid === myPlayerId || prev.includes(pid)) return prev;
      return [...prev, pid];
    });

    // NOTE: WebRTC connection is now initiated via rtc:request/rtc:request:respond flow
    // No automatic connection - players must explicitly request/accept connections
  }, [myPlayerId, state]);

  // When we first join, the server sends us the current roster via `rtc:participants`.
  // Update participant list but do not auto-connect - require explicit request/approval
  const handleParticipants = useCallback(async (payload: unknown) => {
    if (!payload || typeof payload !== 'object') return;
    const obj = payload as { participants?: Array<{ id?: string }> };
    const list = Array.isArray(obj.participants) ? obj.participants : [];
    const others = list.map((p) => (p && p.id ? String(p.id) : null)).filter((x): x is string => !!x && x !== myPlayerId);
    if (others.length === 0 || !myPlayerId) return;

    // Track the first remote peer for potential connection
    const remote = others.sort()[0];
    remotePeerIdRef.current = remote;
    setParticipantIds(others);

    // NOTE: WebRTC connection is now initiated via rtc:request/rtc:request:respond flow
    // No automatic connection - players must explicitly request/accept connections
  }, [myPlayerId]);

  const handlePeerLeft = useCallback((payload: unknown) => {
    if (payload && typeof payload === 'object') {
      const obj = payload as { participants?: Array<{ id?: string }> };
      if (Array.isArray(obj.participants)) {
        setParticipantIds(
          obj.participants
            .map((p) => (p && p.id ? String(p.id) : null))
            .filter((id): id is string => !!id && id !== myPlayerId)
        );
      }
    }
    // Remote left; keep local stream so user can rejoin quickly
    cleanupPc();
    remoteStreamRef.current = null;
    setState('idle');
  }, [cleanupPc, myPlayerId]);

  const join = useCallback(async () => {
    if (!enabled || !transport || !myPlayerId || !activeScopeId) return;
    try {
      setState('joining');
      // Announce presence to room without establishing media connection yet
      // Connection will be established after rtc:request approval
      transport.emit?.('rtc:join');
      setState('idle'); // Return to idle, waiting for connection request
    } catch {
      setState('failed');
    }
  }, [enabled, transport, myPlayerId, activeScopeId]);

  const leave = useCallback(() => {
    if (!transport) return;
    try { transport.emit?.('rtc:leave'); } catch {}
    reset();
    setParticipantIds([]);
  }, [transport, reset]);

  // Initiate WebRTC connection after both parties have approved
  const initiateConnection = useCallback(async () => {
    if (!enabled || !transport || !myPlayerId || !activeScopeId) return;
    if (state !== 'idle' && state !== 'failed' && state !== 'closed') {
      return;
    }

    try {
      setState('negotiating');

      // Get local media tracks
      await addLocalTracks();

      // Determine who should create the offer (lower ID initiates)
      const remotePid = remotePeerIdRef.current;
      if (remotePid && String(myPlayerId) < String(remotePid)) {
        await makeOffer();
      } else {
      }
    } catch (err) {
      console.warn('[RTC][client] failed to initiate connection', err);
      setState('failed');
    }
  }, [enabled, transport, myPlayerId, activeScopeId, state, addLocalTracks, makeOffer]);

  useEffect(() => {
    const prevScopeId = previousScopeIdRef.current;
    if (prevScopeId === activeScopeId) {
      return;
    }

    const wasActive = state === 'joining' || state === 'negotiating' || state === 'connected';

    if (!activeScopeId) {
      if (state !== 'idle') {
        leave();
      }
      previousScopeIdRef.current = null;
      setParticipantIds([]);
      return;
    }

    if (prevScopeId && prevScopeId !== activeScopeId) {
      if (state !== 'idle') {
        leave();
      }
      previousScopeIdRef.current = activeScopeId;
      if (wasActive) {
        void join();
      }
      setParticipantIds([]);
      return;
    }

    previousScopeIdRef.current = activeScopeId;
  }, [activeScopeId, state, leave, join]);

  // Dynamic device switching via replaceTrack
  const switchTrack = useCallback(async (kind: 'audio' | 'video', deviceId: string | null) => {
    try {
      const constraints: MediaStreamConstraints = kind === 'audio'
        ? { audio: deviceId ? { deviceId: { exact: deviceId } } : true }
        : { video: deviceId ? { deviceId: { exact: deviceId } } : true };
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const newTrack = newStream.getTracks()[0];
      const pc = pcRef.current;
      // Replace track on the sender if connected
      const sender = pc?.getSenders().find((s) => s.track?.kind === kind);
      if (sender) await sender.replaceTrack(newTrack);
      // Update local stream container referenced by UI textures
      const local = localStreamRef.current ?? new MediaStream();
      // Remove old tracks of same kind
      for (const t of [...local.getTracks()]) {
        if (t.kind === kind) {
          try { t.stop(); } catch {}
          local.removeTrack(t);
        }
      }
      local.addTrack(newTrack);
      localStreamRef.current = local;
      // Cleanup helper stream container
      for (const t of newStream.getTracks()) {
        if (t.id !== newTrack.id) try { t.stop(); } catch {}
      }
      // Update mute/cam flags to reflect sender state
      if (kind === 'audio') setMicMuted(!(newTrack.enabled));
      if (kind === 'video') setCamOff(!(newTrack.enabled));
    } catch (err) {
      console.warn('[RTC] switchTrack error:', err);
    }
  }, []);

  const chooseAudioDevice = useCallback((id: string | null) => {
    setAudioDeviceId(id);
    void switchTrack('audio', id);
  }, [switchTrack]);

  const chooseVideoDevice = useCallback((id: string | null) => {
    setVideoDeviceId(id);
    void switchTrack('video', id);
  }, [switchTrack]);

  const chooseAudioOutputDevice = useCallback((id: string | null) => {
    setAudioOutputDeviceId(id);
  }, []);

  const toggleMic = useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks() || [];
    const next = !(tracks[0]?.enabled ?? true);
    tracks.forEach((t) => { t.enabled = next; });
    setMicMuted(!next);
  }, []);

  const toggleCam = useCallback(() => {
    if (FEATURE_AUDIO_ONLY) {
      // In audio-only mode, camera controls are disabled/no-op
      setCamOff(true);
      return;
    }
    const tracks = localStreamRef.current?.getVideoTracks() || [];
    const next = !(tracks[0]?.enabled ?? true);
    tracks.forEach((t) => { t.enabled = next; });
    setCamOff(!next);
  }, []);

  // Wire socket listeners
  useEffect(() => {
    if (!enabled || !transport) return;

    const onSignal = (p: unknown) => void handleSignal(p);
    const onJoined = (p: unknown) => void handlePeerJoined(p);
    const onLeft = (p: unknown) => void handlePeerLeft(p);
    const onParticipants = (p: unknown) => void handleParticipants(p);

    transport.onGeneric?.('rtc:signal', onSignal);
    transport.onGeneric?.('rtc:peer-joined', onJoined);
    transport.onGeneric?.('rtc:peer-left', onLeft);
    transport.onGeneric?.('rtc:participants', onParticipants);

    return () => {
      transport.offGeneric?.('rtc:signal', onSignal);
      transport.offGeneric?.('rtc:peer-joined', onJoined);
      transport.offGeneric?.('rtc:peer-left', onLeft);
      transport.offGeneric?.('rtc:participants', onParticipants);
    };
  }, [enabled, transport, handlePeerJoined, handleSignal, handlePeerLeft, handleParticipants]);

  // Phase 3 Fix: Connection quality monitoring
  useEffect(() => {
    if (state !== 'connected' || !pcRef.current) return;

    const pc = pcRef.current;
    const monitoringInterval = setInterval(async () => {
      try {
        const stats = await pc.getStats();

        for (const [, stat] of stats) {
          if (stat.type === 'inbound-rtp' && stat.kind === 'audio') {
            const packetsLost = (stat as { packetsLost?: number }).packetsLost || 0;
            const packetsReceived = (stat as { packetsReceived?: number }).packetsReceived || 1;
            const lossRate = packetsLost / (packetsLost + packetsReceived);

            if (lossRate > 0.05) {
              console.warn('[RTC] High packet loss detected:', {
                lossRate: (lossRate * 100).toFixed(2) + '%',
                packetsLost,
                packetsReceived,
              });
            }

            const jitter = (stat as { jitter?: number }).jitter || 0;
            if (jitter > 0.03) {
              console.warn('[RTC] High jitter detected:', {
                jitter: (jitter * 1000).toFixed(2) + 'ms',
              });
            }

            // Log quality metrics at debug level
          }
        }
      } catch (error) {
        console.warn('[RTC] Failed to get stats:', error);
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(monitoringInterval);
  }, [state]);

  // Auto-cleanup on unmount
  useEffect(() => () => { reset(); setParticipantIds([]); }, [reset]);

  return {
    // Enable RTC feature when either seat video or audio-only is enabled
    featureEnabled: (FEATURE_SEAT_VIDEO || FEATURE_AUDIO_ONLY) && enabled,
    state,
    localStream,
    remoteStream,
    join,
    leave,
    initiateConnection,
    participantIds,
    micMuted,
    camOff,
    toggleMic,
    toggleCam,
    // Devices
    audioDevices,
    videoDevices,
    audioOutputDevices,
    audioDeviceId,
    videoDeviceId,
    audioOutputDeviceId,
    setAudioDeviceId: chooseAudioDevice,
    setVideoDeviceId: chooseVideoDevice,
    setAudioOutputDeviceId: chooseAudioOutputDevice,
    refreshDevices,
  } as const;
}

export type UseMatchWebRTCReturn = ReturnType<typeof useMatchWebRTC>;
