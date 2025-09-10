/**
 * WebRTC Participant Management Utilities
 * Handles participant tracking, stream management, and peer connection state
 */

export interface WebRTCParticipant {
  id: string;
  displayName: string;
  matchId: string;
  joinedAt: number;
  connectionState: RTCPeerConnectionState;
  stream: MediaStream | null;
  peerConnection: RTCPeerConnection | null;
  isLocal: boolean;
}

export interface ParticipantConnectionStats {
  bytesReceived: number;
  bytesSent: number;
  packetsReceived: number;
  packetsLost: number;
  jitter: number;
  roundTripTime: number;
}

export class WebRTCParticipantManager {
  private participants = new Map<string, WebRTCParticipant>();
  private localParticipantId: string | null = null;
  private onParticipantUpdate?: (participants: WebRTCParticipant[]) => void;

  constructor(
    localPlayerId: string | null = null,
    onUpdate?: (participants: WebRTCParticipant[]) => void
  ) {
    this.localParticipantId = localPlayerId;
    this.onParticipantUpdate = onUpdate;
  }

  /**
   * Add or update a participant
   */
  addParticipant(participant: Omit<WebRTCParticipant, 'isLocal'>): void {
    const isLocal = participant.id === this.localParticipantId;
    
    const fullParticipant: WebRTCParticipant = {
      ...participant,
      isLocal,
      connectionState: participant.peerConnection?.connectionState || 'new',
      stream: participant.stream || null,
      peerConnection: participant.peerConnection || null
    };

    this.participants.set(participant.id, fullParticipant);
    this.notifyUpdate();
  }

  /**
   * Remove a participant
   */
  removeParticipant(participantId: string): void {
    const participant = this.participants.get(participantId);
    if (participant) {
      // Clean up peer connection
      if (participant.peerConnection) {
        participant.peerConnection.close();
      }
      
      // Clean up stream
      if (participant.stream) {
        participant.stream.getTracks().forEach(track => track.stop());
      }
      
      this.participants.delete(participantId);
      this.notifyUpdate();
    }
  }

  /**
   * Update participant stream
   */
  updateParticipantStream(participantId: string, stream: MediaStream | null): void {
    const participant = this.participants.get(participantId);
    if (participant) {
      // Stop old stream if replacing
      if (participant.stream && participant.stream !== stream) {
        participant.stream.getTracks().forEach(track => track.stop());
      }
      
      participant.stream = stream;
      this.participants.set(participantId, participant);
      this.notifyUpdate();
    }
  }

  /**
   * Update participant connection state
   */
  updateParticipantConnectionState(
    participantId: string, 
    connectionState: RTCPeerConnectionState
  ): void {
    const participant = this.participants.get(participantId);
    if (participant) {
      participant.connectionState = connectionState;
      this.participants.set(participantId, participant);
      this.notifyUpdate();
    }
  }

  /**
   * Get all participants
   */
  getAllParticipants(): WebRTCParticipant[] {
    return Array.from(this.participants.values());
  }

  /**
   * Get specific participant
   */
  getParticipant(participantId: string): WebRTCParticipant | null {
    return this.participants.get(participantId) || null;
  }

  /**
   * Get local participant
   */
  getLocalParticipant(): WebRTCParticipant | null {
    if (!this.localParticipantId) return null;
    return this.getParticipant(this.localParticipantId);
  }

  /**
   * Get remote participants only
   */
  getRemoteParticipants(): WebRTCParticipant[] {
    return this.getAllParticipants().filter(p => !p.isLocal);
  }

  /**
   * Get connected participants only
   */
  getConnectedParticipants(): WebRTCParticipant[] {
    return this.getAllParticipants().filter(p => 
      p.connectionState === 'connected' || p.isLocal
    );
  }

  /**
   * Get participants with video streams
   */
  getParticipantsWithVideo(): WebRTCParticipant[] {
    return this.getAllParticipants().filter(p => 
      p.stream && p.stream.getVideoTracks().length > 0
    );
  }

  /**
   * Get participants with audio streams
   */
  getParticipantsWithAudio(): WebRTCParticipant[] {
    return this.getAllParticipants().filter(p => 
      p.stream && p.stream.getAudioTracks().length > 0
    );
  }

  /**
   * Update local participant ID
   */
  setLocalParticipantId(participantId: string | null): void {
    // Update isLocal flag for all participants
    const oldLocalId = this.localParticipantId;
    this.localParticipantId = participantId;
    
    if (oldLocalId) {
      const oldLocal = this.participants.get(oldLocalId);
      if (oldLocal) {
        oldLocal.isLocal = false;
        this.participants.set(oldLocalId, oldLocal);
      }
    }
    
    if (participantId) {
      const newLocal = this.participants.get(participantId);
      if (newLocal) {
        newLocal.isLocal = true;
        this.participants.set(participantId, newLocal);
      }
    }
    
    this.notifyUpdate();
  }

  /**
   * Clear all participants
   */
  clearAll(): void {
    // Clean up all peer connections and streams
    this.participants.forEach(participant => {
      if (participant.peerConnection) {
        participant.peerConnection.close();
      }
      if (participant.stream) {
        participant.stream.getTracks().forEach(track => track.stop());
      }
    });
    
    this.participants.clear();
    this.notifyUpdate();
  }

  /**
   * Get connection statistics for a participant
   */
  async getParticipantStats(participantId: string): Promise<ParticipantConnectionStats | null> {
    const participant = this.participants.get(participantId);
    if (!participant?.peerConnection) return null;

    try {
      const stats = await participant.peerConnection.getStats();
      let bytesReceived = 0;
      let bytesSent = 0;
      let packetsReceived = 0;
      let packetsLost = 0;
      let jitter = 0;
      let roundTripTime = 0;

      stats.forEach(report => {
        if (report.type === 'inbound-rtp') {
          bytesReceived += report.bytesReceived || 0;
          packetsReceived += report.packetsReceived || 0;
          packetsLost += report.packetsLost || 0;
          jitter += report.jitter || 0;
        } else if (report.type === 'outbound-rtp') {
          bytesSent += report.bytesSent || 0;
        } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          roundTripTime = report.currentRoundTripTime || 0;
        }
      });

      return {
        bytesReceived,
        bytesSent,
        packetsReceived,
        packetsLost,
        jitter,
        roundTripTime
      };
    } catch (error) {
      console.error('Failed to get participant stats:', error);
      return null;
    }
  }

  /**
   * Check if participant has active media
   */
  hasActiveMedia(participantId: string): { audio: boolean; video: boolean } {
    const participant = this.participants.get(participantId);
    if (!participant?.stream) {
      return { audio: false, video: false };
    }

    const audioTracks = participant.stream.getAudioTracks();
    const videoTracks = participant.stream.getVideoTracks();

    return {
      audio: audioTracks.some(track => track.enabled && track.readyState === 'live'),
      video: videoTracks.some(track => track.enabled && track.readyState === 'live')
    };
  }

  /**
   * Get participant count by connection state
   */
  getParticipantCounts(): Record<RTCPeerConnectionState | 'total', number> {
    const participants = this.getAllParticipants();
    
    return {
      total: participants.length,
      new: participants.filter(p => p.connectionState === 'new').length,
      connecting: participants.filter(p => p.connectionState === 'connecting').length,
      connected: participants.filter(p => p.connectionState === 'connected').length,
      disconnected: participants.filter(p => p.connectionState === 'disconnected').length,
      failed: participants.filter(p => p.connectionState === 'failed').length,
      closed: participants.filter(p => p.connectionState === 'closed').length
    };
  }

  private notifyUpdate(): void {
    if (this.onParticipantUpdate) {
      this.onParticipantUpdate(this.getAllParticipants());
    }
  }
}

/**
 * Utility functions for participant management
 */

/**
 * Create a participant from server data
 */
export function createParticipantFromServer(serverData: {
  id: string;
  displayName: string;
  matchId: string;
  joinedAt: number;
}): Omit<WebRTCParticipant, 'isLocal'> {
  return {
    ...serverData,
    connectionState: 'new' as RTCPeerConnectionState,
    stream: null,
    peerConnection: null
  };
}

/**
 * Compare participants for sorting
 */
export function compareParticipants(a: WebRTCParticipant, b: WebRTCParticipant): number {
  // Local participant first
  if (a.isLocal && !b.isLocal) return -1;
  if (!a.isLocal && b.isLocal) return 1;
  
  // Then by join time
  return a.joinedAt - b.joinedAt;
}

/**
 * Filter participants by criteria
 */
export function filterParticipants(
  participants: WebRTCParticipant[],
  criteria: {
    includeLocal?: boolean;
    includeRemote?: boolean;
    connectionStates?: RTCPeerConnectionState[];
    hasAudio?: boolean;
    hasVideo?: boolean;
  }
): WebRTCParticipant[] {
  return participants.filter(participant => {
    // Local/remote filter
    if (criteria.includeLocal === false && participant.isLocal) return false;
    if (criteria.includeRemote === false && !participant.isLocal) return false;
    
    // Connection state filter
    if (criteria.connectionStates && !criteria.connectionStates.includes(participant.connectionState)) {
      return false;
    }
    
    // Media filters
    if (criteria.hasAudio !== undefined) {
      const hasAudio = participant.stream?.getAudioTracks().some(track => track.enabled) || false;
      if (hasAudio !== criteria.hasAudio) return false;
    }
    
    if (criteria.hasVideo !== undefined) {
      const hasVideo = participant.stream?.getVideoTracks().some(track => track.enabled) || false;
      if (hasVideo !== criteria.hasVideo) return false;
    }
    
    return true;
  });
}