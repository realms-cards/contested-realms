/**
 * Contract: Enhanced Server WebRTC Events
 * Defines the server-side event schemas for WebRTC signaling
 */

export interface WebRTCParticipant {
  id: string;
  displayName: string;
  matchId: string;
  joinedAt: number;
}

// Client → Server Events
export interface ClientWebRTCEvents {
  'rtc:join': () => void;
  'rtc:leave': () => void;
  'rtc:signal': (payload: {
    data: {
      sdp?: RTCSessionDescriptionInit;
      candidate?: RTCIceCandidateInit;
    };
  }) => void;
}

// Server → Client Events  
export interface ServerWebRTCEvents {
  'rtc:peer-joined': (payload: {
    from: {
      id: string;
      displayName: string;
    };
    participants: WebRTCParticipant[];
  }) => void;
  
  'rtc:peer-left': (payload: {
    from: string;
    participants: WebRTCParticipant[];
  }) => void;
  
  'rtc:signal': (payload: {
    from: string;
    data: {
      sdp?: RTCSessionDescriptionInit;
      candidate?: RTCIceCandidateInit;
    };
  }) => void;
  
  'rtc:connection-failed': (payload: {
    peerId: string;
    reason: string;
  }) => void;
  
  'rtc:participants-list': (payload: {
    matchId: string;
    participants: WebRTCParticipant[];
  }) => void;
}

// Server State Management
export interface ServerWebRTCState {
  // Map: matchId → Set<playerId>
  rtcParticipants: Map<string, Set<string>>;
  
  // Map: playerId → WebRTCParticipant
  participantDetails: Map<string, WebRTCParticipant>;
  
  // Map: matchId → connection attempts counter
  connectionAttempts: Map<string, number>;
}

/**
 * Server-side functions for WebRTC management
 */
export interface ServerWebRTCHandlers {
  handleRtcJoin: (socket: any, playerId: string, matchId: string) => void;
  handleRtcLeave: (socket: any, playerId: string, matchId: string) => void;
  handleRtcSignal: (socket: any, playerId: string, matchId: string, data: any) => void;
  cleanupParticipant: (playerId: string) => void;
  getParticipants: (matchId: string) => WebRTCParticipant[];
}