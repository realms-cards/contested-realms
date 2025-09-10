'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FEATURE_SEAT_VIDEO, RTC_STUN_SERVERS } from '@/lib/flags';
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
  iceServers?: RTCIceServer[];
};

export function useMatchWebRTC(opts: UseMatchWebRTCOptions) {
  const { enabled, transport, myPlayerId, matchId } = opts;
  const iceServers = opts.iceServers ?? RTC_STUN_SERVERS;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const remotePeerIdRef = useRef<string | null>(null);
  const [state, setState] = useState<RtcState>('idle');
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  // Device selection state
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDeviceId, setAudioDeviceId] = useState<string | null>(null);
  const [videoDeviceId, setVideoDeviceId] = useState<string | null>(null);

  const localStream = localStreamRef.current;
  const remoteStream = remoteStreamRef.current;

  const cleanupPc = useCallback(() => {
    try {
      pcRef.current?.getSenders().forEach((s) => {
        try { s.track?.stop(); } catch {}
      });
      pcRef.current?.getReceivers().forEach((r) => {
        try { r.track?.stop(); } catch {}
      });
      pcRef.current?.close();
    } catch {}
    pcRef.current = null;
  }, []);

  const cleanupStreams = useCallback(() => {
    try { localStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
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
        // Keep it simple for prototype: mark closed and keep streams as-is
        setState('closed');
      }
    };

    return pc;
  }, [iceServers, transport]);

  // Device enumeration/refresh
  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices(list.filter((d) => d.kind === 'audioinput'));
      setVideoDevices(list.filter((d) => d.kind === 'videoinput'));
    } catch {
      // ignore
    }
  }, []);

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
    // Build constraints from selected IDs; allow default when null
    const constraints: MediaStreamConstraints = {
      audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true,
      video: videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true,
    };
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return stream;
    } catch (err) {
      // Fallback to permissive defaults if specific device failed
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        return stream;
      } catch {
        throw err;
      }
    }
  }, [audioDeviceId, videoDeviceId]);

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
    for (const track of stream.getTracks()) {
      pc.addTrack(track, stream);
    }
  }, [ensurePc, openLocalStream, refreshDevices]);

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
        if (d.sdp.type === 'offer') {
          // Answer offer
          await addLocalTracks();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          transport?.emit?.('rtc:signal', { data: { sdp: pc.localDescription } });
        }
      } else if (d.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(d.candidate));
      }
    } catch {
      // Swallow errors for prototype, mark failed to allow retry via Leave/Join
      setState('failed');
    }
  }, [addLocalTracks, ensurePc, transport]);

  const handlePeerJoined = useCallback(async (payload: unknown) => {
    // expected: { from: { id: string } }
    if (!payload || typeof payload !== 'object') return;
    const obj = payload as { from?: { id?: string } };
    const pid = obj.from?.id ? String(obj.from.id) : null;
    if (!pid || !myPlayerId) return;
    remotePeerIdRef.current = pid;

    // Decide caller deterministically: lower id starts offer
    if (String(myPlayerId) < String(pid)) {
      try {
        await addLocalTracks();
        await makeOffer();
      } catch {
        setState('failed');
      }
    }
  }, [addLocalTracks, makeOffer, myPlayerId]);

  // When we first join, the server sends us the current roster via `rtc:participants`.
  // If there is already someone in the room and our id is lexicographically lower,
  // we should initiate the offer (the existing peer will otherwise do it if their id is lower).
  const handleParticipants = useCallback(async (payload: unknown) => {
    if (!payload || typeof payload !== 'object') return;
    const obj = payload as { participants?: Array<{ id?: string }> };
    const list = Array.isArray(obj.participants) ? obj.participants : [];
    const others = list.map((p) => (p && p.id ? String(p.id) : null)).filter((x): x is string => !!x && x !== myPlayerId);
    if (others.length === 0 || !myPlayerId) return;
    // Pick a deterministic remote to compare (lowest id).
    const remote = others.sort()[0];
    remotePeerIdRef.current = remote;
    if (String(myPlayerId) < String(remote)) {
      try {
        await addLocalTracks();
        await makeOffer();
      } catch {
        setState('failed');
      }
    }
  }, [addLocalTracks, makeOffer, myPlayerId]);

  const handlePeerLeft = useCallback(() => {
    // Remote left; keep local stream so user can rejoin quickly
    cleanupPc();
    remoteStreamRef.current = null;
    setState('idle');
  }, [cleanupPc]);

  const join = useCallback(async () => {
    if (!enabled || !transport || !myPlayerId || !matchId) return;
    try {
      setState('joining');
      await addLocalTracks();
      // Announce presence to room; other peer will respond with offer or we will, based on id ordering
      transport.emit?.('rtc:join');
      setState('negotiating');
    } catch {
      setState('failed');
    }
  }, [enabled, transport, myPlayerId, matchId, addLocalTracks]);

  const leave = useCallback(() => {
    if (!transport) return;
    try { transport.emit?.('rtc:leave'); } catch {}
    reset();
  }, [transport, reset]);

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

  const toggleMic = useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks() || [];
    const next = !(tracks[0]?.enabled ?? true);
    tracks.forEach((t) => { t.enabled = next; });
    setMicMuted(!next);
  }, []);

  const toggleCam = useCallback(() => {
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
    const onLeft = () => void handlePeerLeft();
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

  // Auto-cleanup on unmount
  useEffect(() => () => { reset(); }, [reset]);

  return {
    featureEnabled: FEATURE_SEAT_VIDEO && enabled,
    state,
    localStream,
    remoteStream,
    join,
    leave,
    micMuted,
    camOff,
    toggleMic,
    toggleCam,
    // Devices
    audioDevices,
    videoDevices,
    audioDeviceId,
    videoDeviceId,
    setAudioDeviceId: chooseAudioDevice,
    setVideoDeviceId: chooseVideoDevice,
    refreshDevices,
  } as const;
}
