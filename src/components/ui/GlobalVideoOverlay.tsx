'use client';

/**
 * Global Video Overlay Component
 *
 * Unified, compact overlay that houses the avatar toggle, a tiny online indicator,
 * connection status, media controls and (when connected) the local/remote video tiles.
 *
 * This version can consume the match-level WebRTC instance from the page (preferred)
 * to avoid creating a second peer connection. If no RTC instance is provided, the
 * component remains a lightweight shell (avatar + indicators) and simply hides
 * video sections.
 */

import Image from 'next/image';
import React, { useEffect } from 'react';
import SeatMediaControls, { SeatRtcLike } from '@/components/rtc/SeatMediaControls';
import { useVideoOverlay } from '@/lib/contexts/VideoOverlayContext';
import { FEATURE_AUDIO_ONLY } from '@/lib/flags';
import { ConnectionStatusIndicator } from './ConnectionStatusIndicator';
import { VideoStreamOverlay } from './VideoStreamOverlay';
import type { GlobalVideoOverlayProps } from '../../../specs/006-live-video-and/contracts/ui-components';

/**
 * Global Video Overlay Component
 * 
 * @param props - Component configuration
 * @param props.className - Additional CSS classes to apply
 * @param props.position - Where to position the overlay on screen
 * @param props.showUserAvatar - Whether to show the user avatar menu
 * @returns The rendered video overlay component
 */
export const GlobalVideoOverlay: React.FC<GlobalVideoOverlayProps & {
  // Optional match-level RTC instance supplied by the page to ensure a single PC
  rtc?: SeatRtcLike | null;
  // When expanded, try to auto-connect if RTC is idle (helps with UX and autoplay gating)
  autoConnectOnExpand?: boolean;
}> = ({
  className = '',
  position = 'top-right',
  showUserAvatar = true,
  userDisplayName = '',
  userAvatarUrl = null,
  rtc: rtcProp = null,
  autoConnectOnExpand = false,
}) => {
  const { shouldShowVideo: shouldShowVideoFromScreen, shouldShowControls } = useVideoOverlay();
  const [isMinimized, setIsMinimized] = React.useState(true); // Start collapsed by default

  // Prefer the RTC instance provided by the page (match-level). If none is provided,
  // render the shell only (no separate connection is created here to avoid signaling clashes).
  const rtc = rtcProp ?? null;

  // Auto-connect when the panel is expanded and RTC is idle/failed/closed
  useEffect(() => {
    if (!autoConnectOnExpand) return;
    if (!rtc || !rtc.featureEnabled) return;
    if (isMinimized) return;
    const s = rtc.state;
    if (s === 'idle' || s === 'failed' || s === 'closed') {
      try { void rtc.join(); } catch {}
    }
  }, [autoConnectOnExpand, isMinimized, rtc]);

  // Position classes
  const positionClasses = {
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4', 
    'bottom-right': 'bottom-4 right-4'
  };

  // Global audio-only flag disables video tiles regardless of screen config
  const shouldShowVideo = FEATURE_AUDIO_ONLY ? false : shouldShowVideoFromScreen;

  // Don't render if overlay is disabled for current screen
  if (!shouldShowVideo && !shouldShowControls) {
    return null;
  }

  return (
    <div 
      className={`
        fixed z-[65] ${positionClasses[position]} 
        flex flex-col items-end gap-3 pointer-events-none
        ${className}
      `}
    >
      {/* User Avatar Toggle - acts as minimize/maximize control */}
      <div className="pointer-events-auto">
        <button
          onClick={() => setIsMinimized(!isMinimized)}
          className={`
            relative flex items-center justify-center
            w-8 h-8 rounded-full 
            bg-gradient-to-br from-blue-500 to-purple-600
            hover:from-blue-600 hover:to-purple-700
            transition-all duration-200 ease-out
            focus:outline-none focus:ring-1 focus:ring-blue-400 focus:ring-offset-1
            shadow-md hover:shadow-lg
            overflow-hidden
          `}
          title={isMinimized ? 'Show video controls' : 'Hide video controls'}
        >
          {userAvatarUrl ? (
            <Image
              src={userAvatarUrl}
              alt={userDisplayName || 'User'}
              fill
              sizes="32px"
              className="object-cover"
              priority
            />
          ) : (
            <span className="text-white text-xs font-semibold">
              {userDisplayName ? userDisplayName.slice(0, 2).toUpperCase() : 'ME'}
            </span>
          )}
          
          {/* Media status indicators (camera/mic) */}
          <div className="absolute -top-0.5 -right-0.5 flex gap-0.5">
            {/* Camera indicator */}
            {rtc && !rtc.camOff && !FEATURE_AUDIO_ONLY && (
              <div className="w-2 h-2 rounded-full bg-green-500 border border-white flex items-center justify-center">
                <svg className="w-1 h-1 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z"/>
                </svg>
              </div>
            )}
            
            {/* Microphone indicator */}
            {rtc && !rtc.micMuted && (
              <div className="w-2 h-2 rounded-full bg-blue-500 border border-white flex items-center justify-center">
                <svg className="w-1 h-1 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z"/>
                </svg>
              </div>
            )}
          </div>
          
          {/* Online indicator badge */}
          <div className="
            absolute -bottom-0.5 -right-0.5
            w-3 h-3 rounded-full
            bg-green-400 border border-white
            flex items-center justify-center
          ">
            {!isMinimized && (
              <svg className="w-1.5 h-1.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 13l-7 7-7-7m14-8l-7 7-7-7" />
              </svg>
            )}
            {isMinimized && (
              <svg className="w-1.5 h-1.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 6C15 6.75 14.79 7.44 14.41 8.03L21 9ZM3 9L9.59 8.03C9.21 7.44 9 6.75 9 6L3 7V9ZM9 10C9 8.34 10.34 7 12 7S15 8.34 15 10V11H9V10Z"/>
              </svg>
            )}
          </div>
        </button>
      </div>

      {!isMinimized && (
        <>
          {/* Seat-level compact media controls (join/leave/mic/cam/devices) */}
          {shouldShowControls && rtc && (
            <div className="pointer-events-auto">
              <SeatMediaControls rtc={rtc} className="shadow-lg" />
            </div>
          )}

          {/* Connection Status Indicator */}
          {rtc && rtc.state !== 'idle' && (
            <div className="pointer-events-auto">
              <ConnectionStatusIndicator
                connectionState={rtc.state}
                lastError={undefined}
                onRetry={() => rtc.join()}
                compact={true}
              />
            </div>
          )}

          {/* User Settings Panel - now integrated into the avatar toggle */}
          {showUserAvatar && (
            <div className="pointer-events-auto">
              <div className="
                bg-gray-900/80 backdrop-blur-sm rounded-lg p-3
                shadow-lg border border-gray-700/50
              ">
                <div className="flex items-center gap-2 text-white text-sm">
                  <div className="
                    w-2 h-2 rounded-full bg-green-400
                  " />
                  <span>You are online</span>
                </div>
              </div>
            </div>
          )}

          {/* Remote Video Streams */}
          {shouldShowVideo && rtc && rtc.remoteStream && (
            <div className="pointer-events-auto">
              <VideoStreamOverlay
                stream={rtc.remoteStream}
                playerId={'remote-player'}
                displayName="Remote Player"
                className="shadow-lg rounded-lg overflow-hidden"
              />
            </div>
          )}

          {/* Local Video Preview (when connected) */}
          {shouldShowVideo && rtc && rtc.localStream && rtc.state === 'connected' && (
            <div className="pointer-events-auto">
              <VideoStreamOverlay
                stream={rtc.localStream}
                playerId="local-player"
                displayName="You"
                muted={true} // Always mute local stream to prevent echo
                className="shadow-lg rounded-lg overflow-hidden w-32 h-24"
              />
            </div>
          )}

        </>
      )}
    </div>
  );
};
