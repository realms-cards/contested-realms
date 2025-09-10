/**
 * WebRTC Mocking Utilities for Testing
 * Provides mock implementations of WebRTC APIs for reliable testing
 */

// Mock MediaStream implementation
export class MockMediaStream implements MediaStream {
  id = 'mock-stream-' + Math.random().toString(36).slice(2);
  active = true;
  
  private tracks: MediaStreamTrack[] = [];
  
  constructor(tracks: MediaStreamTrack[] = []) {
    this.tracks = tracks;
  }
  
  addTrack(track: MediaStreamTrack): void {
    this.tracks.push(track);
  }
  
  removeTrack(track: MediaStreamTrack): void {
    const index = this.tracks.indexOf(track);
    if (index > -1) this.tracks.splice(index, 1);
  }
  
  getTracks(): MediaStreamTrack[] {
    return [...this.tracks];
  }
  
  getAudioTracks(): MediaStreamTrack[] {
    return this.tracks.filter(t => t.kind === 'audio');
  }
  
  getVideoTracks(): MediaStreamTrack[] {
    return this.tracks.filter(t => t.kind === 'video');
  }
  
  getTrackById(id: string): MediaStreamTrack | null {
    return this.tracks.find(t => t.id === id) || null;
  }
  
  clone(): MediaStream {
    return new MockMediaStream([...this.tracks]);
  }
  
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent(): boolean { return true; }
  
  // Required but unused properties
  onactive = null;
  oninactive = null;
  onaddtrack = null;
  onremovetrack = null;
}

// Mock MediaStreamTrack implementation
export class MockMediaStreamTrack implements MediaStreamTrack {
  id = 'mock-track-' + Math.random().toString(36).slice(2);
  enabled = true;
  muted = false;
  readyState: MediaStreamTrackState = 'live';
  
  constructor(
    public kind: 'audio' | 'video',
    public label = `Mock ${kind} track`
  ) {}
  
  stop(): void {
    this.readyState = 'ended';
  }
  
  clone(): MediaStreamTrack {
    const clone = new MockMediaStreamTrack(this.kind, this.label);
    clone.enabled = this.enabled;
    return clone;
  }
  
  getCapabilities(): MediaTrackCapabilities {
    return {};
  }
  
  getConstraints(): MediaTrackConstraints {
    return {};
  }
  
  getSettings(): MediaTrackSettings {
    return {
      deviceId: 'mock-device-' + this.kind,
      groupId: 'mock-group-' + this.kind,
    };
  }
  
  applyConstraints(): Promise<void> {
    return Promise.resolve();
  }
  
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent(): boolean { return true; }
  
  // Required but unused properties
  onmute = null;
  onunmute = null;
  onended = null;
  contentHint = '';
  isolated = false;
}

// Mock RTCPeerConnection implementation
export class MockRTCPeerConnection implements Partial<RTCPeerConnection> {
  connectionState: RTCPeerConnectionState = 'new';
  iceConnectionState: RTCIceConnectionState = 'new';
  iceGatheringState: RTCIceGatheringState = 'new';
  signalingState: RTCSignalingState = 'stable';
  
  localDescription: RTCSessionDescription | null = null;
  remoteDescription: RTCSessionDescription | null = null;
  
  private senders: RTCRtpSender[] = [];
  private receivers: RTCRtpReceiver[] = [];
  
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return {
      type: 'offer',
      sdp: 'mock-sdp-offer'
    };
  }
  
  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return {
      type: 'answer', 
      sdp: 'mock-sdp-answer'
    };
  }
  
  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description as RTCSessionDescription;
    this.signalingState = description.type === 'offer' ? 'have-local-offer' : 'stable';
  }
  
  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description as RTCSessionDescription;
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
  }
  
  addTrack(track: MediaStreamTrack, stream: MediaStream): RTCRtpSender {
    const sender = {
      track,
      replaceTrack: async (newTrack: MediaStreamTrack | null) => {
        sender.track = newTrack;
      }
    } as RTCRtpSender;
    
    this.senders.push(sender);
    return sender;
  }
  
  getSenders(): RTCRtpSender[] {
    return [...this.senders];
  }
  
  getReceivers(): RTCRtpReceiver[] {
    return [...this.receivers];
  }
  
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    // Mock successful ICE candidate addition
  }
  
  close(): void {
    this.connectionState = 'closed';
    this.onconnectionstatechange?.();
  }
  
  // Mock successful connection after brief delay
  mockConnect(): void {
    setTimeout(() => {
      this.connectionState = 'connected';
      this.iceConnectionState = 'connected';
      this.onconnectionstatechange?.();
    }, 100);
  }
  
  // Mock connection failure
  mockFail(): void {
    setTimeout(() => {
      this.connectionState = 'failed';
      this.iceConnectionState = 'failed';
      this.onconnectionstatechange?.();
    }, 100);
  }
  
  // Mock receiving remote track
  mockRemoteTrack(track: MediaStreamTrack, stream: MediaStream): void {
    setTimeout(() => {
      const receiver = { track } as RTCRtpReceiver;
      this.receivers.push(receiver);
      
      this.ontrack?.({
        track,
        receiver,
        streams: [stream],
        transceiver: {} as RTCRtpTransceiver
      } as RTCTrackEvent);
    }, 50);
  }
}

// Mock MediaDevices API
export class MockMediaDevices implements Partial<MediaDevices> {
  private devices: MediaDeviceInfo[] = [
    {
      deviceId: 'mock-audio-1',
      groupId: 'mock-group-1',
      kind: 'audioinput',
      label: 'Mock Microphone 1',
      toJSON: () => ({})
    } as MediaDeviceInfo,
    {
      deviceId: 'mock-video-1', 
      groupId: 'mock-group-2',
      kind: 'videoinput',
      label: 'Mock Camera 1',
      toJSON: () => ({})
    } as MediaDeviceInfo
  ];
  
  async enumerateDevices(): Promise<MediaDeviceInfo[]> {
    return [...this.devices];
  }
  
  async getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
    const tracks: MediaStreamTrack[] = [];
    
    if (constraints.audio) {
      tracks.push(new MockMediaStreamTrack('audio', 'Mock Microphone'));
    }
    
    if (constraints.video) {
      tracks.push(new MockMediaStreamTrack('video', 'Mock Camera'));
    }
    
    return new MockMediaStream(tracks);
  }
  
  addDevice(device: Partial<MediaDeviceInfo>): void {
    this.devices.push(device as MediaDeviceInfo);
  }
  
  removeDevice(deviceId: string): void {
    this.devices = this.devices.filter(d => d.deviceId !== deviceId);
  }
  
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent(): boolean { return true; }
  
  ondevicechange = null;
}

// Setup WebRTC mocks in global environment
export function setupWebRTCMocks(): {
  cleanup: () => void;
  mockMediaDevices: MockMediaDevices;
} {
  const originalRTCPeerConnection = (global as unknown as { RTCPeerConnection?: unknown }).RTCPeerConnection;
  const originalGetUserMedia = navigator.getUserMedia;
  const originalMediaDevices = navigator.mediaDevices;
  
  const mockMediaDevices = new MockMediaDevices();
  
  // Mock WebRTC APIs
  (global as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = MockRTCPeerConnection;
  
  // Mock navigator APIs
  Object.defineProperty(navigator, 'mediaDevices', {
    value: mockMediaDevices,
    writable: true
  });
  
  // Mock permissions API  
  Object.defineProperty(navigator, 'permissions', {
    value: {
      query: async ({ name }: { name: string }) => ({
        state: name === 'camera' || name === 'microphone' ? 'granted' : 'denied'
      })
    },
    writable: true
  });
  
  return {
    cleanup: () => {
      if (originalRTCPeerConnection) {
        (global as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = originalRTCPeerConnection;
      }
      if (originalGetUserMedia) {
        navigator.getUserMedia = originalGetUserMedia;
      }
      if (originalMediaDevices) {
        Object.defineProperty(navigator, 'mediaDevices', {
          value: originalMediaDevices,
          writable: true
        });
      }
    },
    mockMediaDevices
  };
}

// Helper to create mock stream with audio and video
export function createMockStream(): MockMediaStream {
  return new MockMediaStream([
    new MockMediaStreamTrack('audio'),
    new MockMediaStreamTrack('video')
  ]);
}

// Helper to create mock peer connection that succeeds
export function createSuccessfulMockPeerConnection(): MockRTCPeerConnection {
  const pc = new MockRTCPeerConnection();
  pc.mockConnect();
  return pc;
}

// Helper to create mock peer connection that fails
export function createFailingMockPeerConnection(): MockRTCPeerConnection {
  const pc = new MockRTCPeerConnection();
  pc.mockFail();
  return pc;
}