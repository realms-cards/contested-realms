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
import { OnlineContext } from '@/app/online/online-context';
import SeatMediaControls, { SeatRtcLike } from '@/components/rtc/SeatMediaControls';
import { useSound } from '@/lib/contexts/SoundContext';
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
  // Connection request callback for matches
  onRequestConnection?: (targetId: string) => void;
  targetPlayerId?: string | null;
}> = ({
  className = '',
  position = 'top-right',
  showUserAvatar = true,
  userDisplayName = '',
  userAvatarUrl = null,
  rtc: rtcProp = null,
  autoConnectOnExpand = false,
  onRequestConnection,
  targetPlayerId,
}) => {
  const { shouldShowVideo: shouldShowVideoFromScreen, shouldShowControls } = useVideoOverlay();
  const onlineCtx = React.useContext(OnlineContext);
  const [isMinimized, setIsMinimized] = React.useState(true); // Start collapsed by default
  const { volume, setVolume, playCardShuffle } = useSound();
  const volumeSliderId = React.useId();
  const sliderValue = Math.round(volume * 100);

  // Prefer the RTC instance provided by the page (match-level). If none is provided,
  // render the shell only (no separate connection is created here to avoid signaling clashes).
  const rtc = rtcProp ?? onlineCtx?.voice?.rtc ?? null;
  const playbackEnabled = onlineCtx?.voice?.playbackEnabled;
  const setPlaybackEnabled = onlineCtx?.voice?.setPlaybackEnabled;
  const voiceFeatureEnabled = onlineCtx?.voice?.enabled ?? false;

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

  // No compact status indicator when avatar is hidden; rely on UserBadge presence instead

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
      {/* Avatar toggle (optional). When disabled, render a compact status dot only. */}
      {showUserAvatar ? (
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
          </button>
        </div>
      ) : null}

      {!isMinimized && (
        <>
          {/* Seat-level compact media controls (join/leave/mic/cam/devices) */}
          {shouldShowControls && rtc && (
            <div className="pointer-events-auto">
              <SeatMediaControls
                rtc={rtc}
                className="shadow-lg"
                playbackEnabled={playbackEnabled}
                onTogglePlayback={setPlaybackEnabled}
                renderAudioElement={!voiceFeatureEnabled}
                showSpeakerToggle={!voiceFeatureEnabled}
                onRequestConnection={onRequestConnection}
                targetPlayerId={targetPlayerId}
              />
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
                <div className="flex flex-col gap-3 text-white text-sm">
                  <div className="flex items-center gap-2">
                    <div className="
                      w-2 h-2 rounded-full bg-green-400
                    " />
                    <span>You are online</span>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="flex items-center justify-between text-xs uppercase tracking-wide text-white/60" htmlFor={volumeSliderId}>
                      <span>Sound Volume</span>
                      <span>{sliderValue}%</span>
                    </label>
                    <input
                      id={volumeSliderId}
                      type="range"
                      min={0}
                      max={100}
                      value={sliderValue}
                      onChange={(event) => {
                        setVolume(event.currentTarget.valueAsNumber / 100);
                      }}
                      onPointerUp={(event) => {
                        const nextVolume = event.currentTarget.valueAsNumber / 100;
                        if (nextVolume > 0) {
                          playCardShuffle();
                        }
                      }}
                      className="w-44 accent-purple-400"
                    />
                  </div>
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
