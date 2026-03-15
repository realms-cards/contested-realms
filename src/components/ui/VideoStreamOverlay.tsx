/**
 * Video Stream Overlay Component
 * Displays individual video streams with player information and controls
 */

import React, { useRef, useEffect, useState } from 'react';
import type { VideoStreamOverlayProps } from '@/lib/rtc/types';

export const VideoStreamOverlay: React.FC<VideoStreamOverlayProps> = ({ 
  stream, 
  playerId,
  displayName, 
  muted = false, 
  className = '' 
}) => {
  void playerId;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);

  // Update video element when stream changes
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.muted = muted;
    }
    
    return undefined;
  }, [stream, muted]);

  // Analyze stream tracks
  useEffect(() => {
    if (stream) {
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();
      
      setHasVideo(videoTracks.length > 0 && videoTracks.some(track => track.enabled));
      setHasAudio(audioTracks.length > 0 && audioTracks.some(track => track.enabled));
    } else {
      setHasVideo(false);
      setHasAudio(false);
    }
    
    return undefined;
  }, [stream]);

  // Handle video load events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedData = () => setIsVideoLoaded(true);
    const handleLoadStart = () => setIsVideoLoaded(false);

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('loadstart', handleLoadStart);

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('loadstart', handleLoadStart);
    };
  }, []);

  if (!stream) {
    return null;
  }

  return (
    <div className={`
      relative bg-gray-900 rounded-lg overflow-hidden
      min-w-0 min-h-0
      ${className}
    `}>
      {/* Video Element */}
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className="w-full h-full object-cover"
        />
      ) : (
        // Audio-only mode - show avatar/placeholder
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-600 to-purple-700">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-2 bg-white/20 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2a3 3 0 013 3v6a3 3 0 01-6 0V5a3 3 0 013-3z"/>
                <path d="M19 10v2a7 7 0 11-14 0v-2"/>
                <path d="M12 19v4M8 23h8"/>
              </svg>
            </div>
            <p className="text-white text-sm font-medium">
              {displayName}
            </p>
            <p className="text-white/70 text-xs">
              Audio Only
            </p>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {hasVideo && !isVideoLoaded && (
        <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
          <div className="text-center text-white">
            <svg className="w-6 h-6 mx-auto mb-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <p className="text-xs">Loading video...</p>
          </div>
        </div>
      )}
      
      {/* Player Info Overlay */}
      <div className="absolute bottom-0 left-0 right-0">
        <div className="bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-white text-sm font-medium truncate">
              {displayName}
            </span>
            
            <div className="flex items-center gap-1 ml-2">
              {/* Audio Indicator */}
              <div className={`
                p-1 rounded-full text-xs
                ${hasAudio && !muted 
                  ? 'bg-green-500/80 text-white' 
                  : 'bg-red-500/80 text-white'
                }
              `}>
                {hasAudio && !muted ? (
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2a3 3 0 013 3v6a3 3 0 01-6 0V5a3 3 0 013-3z"/>
                    <path d="M19 10v2a7 7 0 11-14 0v-2"/>
                  </svg>
                ) : (
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16.5 12A4.5 4.5 0 0014.64 7.64L13.41 8.87A3 3 0 0115 11.24V12a3 3 0 01-4.5 2.6L9 16.1A4.44 4.44 0 0012 17a4.5 4.5 0 004.5-5zM20 12a8 8 0 01-2.3 5.7l-1.4-1.4A6 6 0 0018 12a6 6 0 00-1.7-4.3l1.4-1.4A8 8 0 0120 12zM1 1l22 22-1.4 1.4L3.6 2.4 1 1zm10.5 9.5L7.48 6.48A3 3 0 0112 5a3 3 0 013 3v4a3 3 0 01-.18.97L11.5 10.5z"/>
                  </svg>
                )}
              </div>
              
              {/* Video Indicator */}
              {hasVideo && (
                <div className="p-1 bg-green-500/80 text-white rounded-full text-xs">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/>
                  </svg>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Connection Quality Indicator */}
      <div className="absolute top-2 right-2">
        <div className="flex items-center gap-1">
          <div className="w-1 h-2 bg-green-400 rounded-sm" />
          <div className="w-1 h-3 bg-green-400 rounded-sm" />
          <div className="w-1 h-4 bg-green-400 rounded-sm" />
          <div className="w-1 h-2 bg-gray-400 rounded-sm opacity-30" />
        </div>
      </div>
    </div>
  );
};

/**
 * Compact Video Stream Component
 * Smaller version for picture-in-picture scenarios
 */
export const CompactVideoStream: React.FC<VideoStreamOverlayProps & {
  size?: 'xs' | 'sm' | 'md';
  showControls?: boolean;
}> = ({ 
  stream, 
  playerId,
  displayName, 
  muted = false, 
  className = '',
  size = 'sm',
  showControls = false
}) => {
  void playerId;
  const sizeClasses = {
    xs: 'w-16 h-12',
    sm: 'w-24 h-18',
    md: 'w-32 h-24'
  };

  return (
    <div className={`
      ${sizeClasses[size]} ${className}
      relative rounded-md overflow-hidden
      border-2 border-white/20 shadow-lg
    `}>
      <VideoStreamOverlay
        stream={stream}
        playerId={playerId}
        displayName={displayName}
        muted={muted}
        className="w-full h-full"
      />
      
      {/* Compact Controls Overlay */}
      {showControls && (
        <div className="absolute top-1 left-1 flex gap-1">
          <button className="p-0.5 bg-black/50 rounded-full text-white text-xs hover:bg-black/70">
            <svg className="w-2 h-2" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};