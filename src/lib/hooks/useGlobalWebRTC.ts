/**
 * Global WebRTC Hook
 * Manages WebRTC connections and media controls across the application
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  WebRTCHookOptions,
  WebRTCHookReturn,
  RtcState,
  PermissionState
} from '@/lib/rtc/types';

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

export function useGlobalWebRTC(options: WebRTCHookOptions): WebRTCHookReturn {
  // Core WebRTC state
  const [connectionState, setConnectionState] = useState<RtcState>('idle');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  
  // Media device state
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string | null>(null);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string | null>(null);
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
  const [cameraDisabled, setCameraDisabled] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [devicePermissionStatus, setDevicePermissionStatus] = useState<PermissionState>('checking');
  
  // WebRTC connection objects
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;
  
  const { enabled, transport, myPlayerId, matchId, iceServers = DEFAULT_ICE_SERVERS } = options;

  // Clear any errors
  const clearError = useCallback(() => {
    setLastError(null);
  }, []);

  // Check device permissions
  const checkPermissions = useCallback(async (): Promise<boolean> => {
    try {
      setDevicePermissionStatus('checking');
      
      // Check if permissions are already granted
      const permissionStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
      const audioPermissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      
      const hasPermissions = permissionStatus.state === 'granted' && audioPermissionStatus.state === 'granted';
      
      if (hasPermissions) {
        setDevicePermissionStatus('granted');
        setPermissionsGranted(true);
        return true;
      } else if (permissionStatus.state === 'denied' || audioPermissionStatus.state === 'denied') {
        setDevicePermissionStatus('denied');
        setPermissionsGranted(false);
        return false;
      } else {
        setDevicePermissionStatus('prompt');
        setPermissionsGranted(false);
        return false;
      }
    } catch (error) {
      console.warn('Permission check failed:', error);
      setDevicePermissionStatus('prompt');
      setPermissionsGranted(false);
      return false;
    }
  }, []);

  // Request device permissions
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      setDevicePermissionStatus('checking');
      
      // Request media access to trigger permission prompt
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: true 
      });
      
      // Clean up the temporary stream
      stream.getTracks().forEach(track => track.stop());
      
      setDevicePermissionStatus('granted');
      setPermissionsGranted(true);
      return true;
    } catch (error) {
      console.error('Permission request failed:', error);
      setDevicePermissionStatus('denied');
      setPermissionsGranted(false);
      setLastError('Failed to get media permissions');
      return false;
    }
  }, []);

  // Refresh available devices
  const refreshDevices = useCallback(async (): Promise<void> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const audioInputDevices = devices.filter(device => device.kind === 'audioinput');
      const videoInputDevices = devices.filter(device => device.kind === 'videoinput');
      
      setAudioDevices(audioInputDevices);
      setVideoDevices(videoInputDevices);
      
      // Set default devices if none selected
      if (!selectedAudioDeviceId && audioInputDevices.length > 0) {
        setSelectedAudioDeviceId(audioInputDevices[0].deviceId);
      }
      if (!selectedVideoDeviceId && videoInputDevices.length > 0) {
        setSelectedVideoDeviceId(videoInputDevices[0].deviceId);
      }
    } catch (error) {
      console.error('Failed to enumerate devices:', error);
      setLastError('Failed to access media devices');
    }
  }, [selectedAudioDeviceId, selectedVideoDeviceId]);

  // Get user media with current settings
  const getUserMedia = useCallback(async (): Promise<MediaStream | null> => {
    try {
      if (!permissionsGranted) {
        const granted = await requestPermissions();
        if (!granted) return null;
      }

      const constraints: MediaStreamConstraints = {
        audio: selectedAudioDeviceId 
          ? { deviceId: { exact: selectedAudioDeviceId } }
          : true,
        video: cameraDisabled 
          ? false 
          : selectedVideoDeviceId 
            ? { deviceId: { exact: selectedVideoDeviceId } }
            : true
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Apply current mute state
      if (microphoneMuted) {
        stream.getAudioTracks().forEach(track => track.enabled = false);
      }

      return stream;
    } catch (error) {
      console.error('Failed to get user media:', error);
      setLastError('Failed to access camera or microphone');
      return null;
    }
  }, [permissionsGranted, selectedAudioDeviceId, selectedVideoDeviceId, cameraDisabled, microphoneMuted, requestPermissions]);

  // Create peer connection
  const createPeerConnection = useCallback((): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers });
    
    pc.onicecandidate = (event) => {
      if (event.candidate && transport) {
        transport.emit('rtc:signal', {
          data: { ice: event.candidate }
        });
      }
    };
    
    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };
    
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      
      if (state === 'connected') {
        setConnectionState('connected');
        retryCountRef.current = 0;
        clearError();
      } else if (state === 'failed' || state === 'disconnected') {
        setConnectionState('failed');
        setRemoteStream(null);
        
        if (transport && retryCountRef.current < maxRetries) {
          transport.emit('rtc:connection-failed', {
            reason: `Connection ${state}`,
            code: 'CONNECTION_STATE_CHANGE'
          });
        }
      }
    };
    
    return pc;
  }, [iceServers, transport, clearError]);

  // Join WebRTC session
  const join = useCallback(async (): Promise<void> => {
    if (!enabled || !transport || !myPlayerId || !matchId) {
      setLastError('WebRTC not properly configured');
      return;
    }

    if (connectionState !== 'idle' && connectionState !== 'failed') {
      return; // Already connecting or connected
    }

    try {
      setConnectionState('joining');
      clearError();

      // Get local media stream
      const stream = await getUserMedia();
      if (!stream) {
        throw new Error('Failed to get media stream');
      }

      setLocalStream(stream);

      // Create peer connection and add local stream
      const pc = createPeerConnection();
      peerConnectionRef.current = pc;

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Join the WebRTC session on server
      transport.emit('rtc:join');
      
      setConnectionState('negotiating');
      
    } catch (error) {
      console.error('Failed to join WebRTC session:', error);
      setLastError(error instanceof Error ? error.message : 'Failed to join session');
      setConnectionState('failed');
    }
  }, [enabled, transport, myPlayerId, matchId, connectionState, clearError, getUserMedia, createPeerConnection]);

  // Leave WebRTC session
  const leave = useCallback((): void => {
    if (transport) {
      transport.emit('rtc:leave');
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Stop local stream
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }

    setRemoteStream(null);
    setConnectionState('idle');
    retryCountRef.current = 0;
    clearError();
  }, [transport, localStream, clearError]);

  // Retry connection
  const retry = useCallback(async (): Promise<void> => {
    if (retryCountRef.current >= maxRetries) {
      setLastError('Maximum retry attempts exceeded');
      return;
    }

    retryCountRef.current += 1;
    setConnectionState('idle');
    clearError();
    
    // Wait a bit before retrying
    setTimeout(() => {
      join();
    }, 1000 * retryCountRef.current);
  }, [join, clearError]);

  // Toggle microphone
  const toggleMicrophone = useCallback((): void => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach(track => track.enabled = microphoneMuted);
    }
    setMicrophoneMuted(!microphoneMuted);
  }, [localStream, microphoneMuted]);

  // Toggle camera
  const toggleCamera = useCallback((): void => {
    setCameraDisabled(!cameraDisabled);
    
    // If we're currently connected, restart with new settings
    if (connectionState === 'connected') {
      // This would require renegotiation - simplified for now
      console.log('Camera toggle requires stream renegotiation');
    }
  }, [cameraDisabled, connectionState]);

  // Set audio device
  const setAudioDevice = useCallback(async (deviceId: string | null): Promise<void> => {
    setSelectedAudioDeviceId(deviceId);
    
    // If we're currently connected, restart with new device
    if (connectionState === 'connected' && localStream) {
      try {
        const newStream = await getUserMedia();
        if (newStream && peerConnectionRef.current) {
          // Replace audio track
          const oldAudioTrack = localStream.getAudioTracks()[0];
          const newAudioTrack = newStream.getAudioTracks()[0];
          
          if (oldAudioTrack && newAudioTrack) {
            const sender = peerConnectionRef.current.getSenders().find(s => s.track === oldAudioTrack);
            if (sender) {
              await sender.replaceTrack(newAudioTrack);
            }
          }
          
          // Update local stream
          setLocalStream(newStream);
          oldAudioTrack?.stop();
        }
      } catch (error) {
        console.error('Failed to change audio device:', error);
        setLastError('Failed to change audio device');
      }
    }
  }, [connectionState, localStream, getUserMedia]);

  // Set video device
  const setVideoDevice = useCallback(async (deviceId: string | null): Promise<void> => {
    setSelectedVideoDeviceId(deviceId);
    
    // Similar logic to audio device change
    if (connectionState === 'connected' && localStream && !cameraDisabled) {
      try {
        const newStream = await getUserMedia();
        if (newStream && peerConnectionRef.current) {
          const oldVideoTrack = localStream.getVideoTracks()[0];
          const newVideoTrack = newStream.getVideoTracks()[0];
          
          if (oldVideoTrack && newVideoTrack) {
            const sender = peerConnectionRef.current.getSenders().find(s => s.track === oldVideoTrack);
            if (sender) {
              await sender.replaceTrack(newVideoTrack);
            }
          }
          
          setLocalStream(newStream);
          oldVideoTrack?.stop();
        }
      } catch (error) {
        console.error('Failed to change video device:', error);
        setLastError('Failed to change video device');
      }
    }
  }, [connectionState, localStream, cameraDisabled, getUserMedia]);

  // Handle incoming WebRTC signals
  useEffect(() => {
    if (!transport) return;

    const handleSignal = async (payload: unknown) => {
      const signalPayload = payload as { from: string; data: { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit } };
      if (!peerConnectionRef.current || signalPayload.from === myPlayerId) return;

      try {
        const { data } = signalPayload;
        
        if (data.sdp) {
          await peerConnectionRef.current.setRemoteDescription(data.sdp);
          
          if (data.sdp.type === 'offer') {
            const answer = await peerConnectionRef.current.createAnswer();
            await peerConnectionRef.current.setLocalDescription(answer);
            
            transport.emit('rtc:signal', {
              data: { sdp: answer }
            });
          }
        } else if (data.ice) {
          await peerConnectionRef.current.addIceCandidate(data.ice);
        }
      } catch (error) {
        console.error('Failed to handle WebRTC signal:', error);
        setLastError('Failed to process WebRTC signal');
      }
    };

    const handlePeerJoined = async () => {
      if (!peerConnectionRef.current || !localStream) return;
      
      try {
        // Create offer for new peer
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        
        transport.emit('rtc:signal', {
          data: { sdp: offer }
        });
      } catch (error) {
        console.error('Failed to create offer for new peer:', error);
      }
    };

    const handlePeerLeft = (payload: unknown) => {
      const leftPayload = payload as { from: string };
      if (leftPayload.from !== myPlayerId) {
        setRemoteStream(null);
      }
    };

    const handleConnectionFailedAck = () => {
      // Server acknowledged our connection failure report
      if (retryCountRef.current < maxRetries) {
        retry();
      }
    };

    transport.onGeneric('rtc:signal', handleSignal);
    transport.onGeneric('rtc:peer-joined', handlePeerJoined);
    transport.onGeneric('rtc:peer-left', handlePeerLeft);
    transport.onGeneric('rtc:connection-failed-ack', handleConnectionFailedAck);

    return () => {
      // Note: Transport cleanup would happen here if onGeneric returned cleanup functions
    };
  }, [transport, myPlayerId, localStream, retry]);

  // Initialize permissions and devices on mount
  useEffect(() => {
    if (enabled) {
      checkPermissions();
      refreshDevices();
    }
  }, [enabled, checkPermissions, refreshDevices]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      leave();
    };
  }, [leave]);

  return {
    // State
    connectionState,
    localStream,
    remoteStream,
    lastError,
    permissionsGranted,
    matchId,
    remotePeerId: null, // Would track specific remote peer ID
    
    // Media settings
    selectedAudioDeviceId,
    selectedVideoDeviceId,
    microphoneMuted,
    cameraDisabled,
    audioDevices,
    videoDevices,
    devicePermissionStatus,
    
    // Actions
    join,
    leave,
    retry,
    toggleMicrophone,
    toggleCamera,
    setAudioDevice,
    setVideoDevice,
    refreshDevices,
    checkPermissions,
    requestPermissions,
    clearError
  };
}
