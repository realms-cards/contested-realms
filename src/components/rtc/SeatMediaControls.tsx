"use client";

import { Camera, CameraOff, Mic, MicOff, RefreshCw, Settings, Video, PhoneOff, Volume2, VolumeX, Phone } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { RcButton } from "@/components/ui/rc-button";
import { FEATURE_AUDIO_ONLY } from '@/lib/flags';

/** Muted / off toggles read as a warning, not a gold tint. */
const MUTED_PRESSED =
  "aria-pressed:border-rc-warning/60 aria-pressed:bg-rc-warning/30 aria-pressed:text-rc-fg-strong";

// Minimal shape expected from useMatchWebRTC
export type SeatRtcLike = {
  featureEnabled: boolean;
  state: "idle" | "joining" | "negotiating" | "connected" | "failed" | "closed";
  join: () => Promise<void> | void;
  leave: () => void;
  micMuted: boolean;
  camOff: boolean;
  toggleMic: () => void;
  toggleCam: () => void;
  audioDevices: MediaDeviceInfo[];
  videoDevices: MediaDeviceInfo[];
  audioOutputDevices: MediaDeviceInfo[];
  audioDeviceId: string | null;
  videoDeviceId: string | null;
  audioOutputDeviceId: string | null;
  setAudioDeviceId: (id: string | null) => void;
  setVideoDeviceId: (id: string | null) => void;
  setAudioOutputDeviceId: (id: string | null) => void;
  refreshDevices: () => void;
  // Streams exposed by useMatchWebRTC
  localStream?: MediaStream | null;
  remoteStream: MediaStream | null;
};

export default function SeatMediaControls({
  rtc,
  className,
  playbackEnabled: controlledPlayback,
  onTogglePlayback,
  renderAudioElement = true,
  showSpeakerToggle,
  menuAlignment = 'left',
  onRequestConnection,
  targetPlayerId,
}: {
  rtc: SeatRtcLike;
  className?: string;
  playbackEnabled?: boolean;
  onTogglePlayback?: (next: boolean) => void;
  renderAudioElement?: boolean;
  showSpeakerToggle?: boolean;
  menuAlignment?: 'left' | 'right';
  onRequestConnection?: (targetId: string) => void;
  targetPlayerId?: string | null;
}) {
  const [showDevices, setShowDevices] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);
  const [internalPlaybackEnabled, setInternalPlaybackEnabled] = useState(true);

  const isPlaybackControlled = typeof onTogglePlayback === "function";
  const playbackEnabled = isPlaybackControlled
    ? controlledPlayback ?? true
    : internalPlaybackEnabled;

  const setPlaybackEnabled = useCallback(
    (next: boolean) => {
      if (isPlaybackControlled) {
        onTogglePlayback?.(next);
      } else {
        setInternalPlaybackEnabled(next);
      }
    },
    [isPlaybackControlled, onTogglePlayback]
  );

  const togglePlayback = useCallback(() => {
    setPlaybackEnabled(!playbackEnabled);
  }, [setPlaybackEnabled, playbackEnabled]);

  const effectiveShowSpeakerToggle = showSpeakerToggle ?? renderAudioElement;

  // Attach remote audio stream for non-spatial playback
  useEffect(() => {
    if (!rtc.featureEnabled || !renderAudioElement) return;
    const el = audioRef.current;
    if (!el) return;
    try {
      if (rtc.remoteStream) {
        el.srcObject = rtc.remoteStream as unknown as MediaStream;
        if (playbackEnabled) {
          const p = el.play();
          if (p && typeof (p as Promise<void>).then === "function") {
            p.catch(() => {
              setNeedsAudioUnlock(true);
            });
          }
        } else {
          el.pause();
        }
      } else {
        el.pause();
        el.srcObject = null;
        setNeedsAudioUnlock(false);
      }
      el.muted = !playbackEnabled;
      if (!playbackEnabled) {
        setNeedsAudioUnlock(false);
      }
    } catch {
      // ignore
    }
  }, [rtc.featureEnabled, rtc.remoteStream, playbackEnabled, renderAudioElement]);

  useEffect(() => {
    if (!renderAudioElement) return;
    const el = audioRef.current;
    if (!el) return;
    const sink = (el as unknown as { setSinkId?: (id: string) => Promise<void> }).setSinkId;
    if (typeof sink === "function") {
      const id = rtc.audioOutputDeviceId && rtc.audioOutputDeviceId.length > 0 ? rtc.audioOutputDeviceId : "default";
      sink.call(el, id).catch(() => {
        // ignore sink errors
      });
    }
  }, [rtc.audioOutputDeviceId, renderAudioElement]);

  useEffect(() => {
    if (!needsAudioUnlock) return;
    const attemptPlayback = () => {
      const el = audioRef.current;
      if (!el) return;
      el
        .play()
        .then(() => {
          setNeedsAudioUnlock(false);
          setPlaybackEnabled(true);
        })
        .catch(() => {
          // Keep waiting for another gesture
        });
    };
    const handler = () => {
      attemptPlayback();
      document.removeEventListener('pointerdown', handler);
      document.removeEventListener('keydown', handler);
    };
    document.addEventListener('pointerdown', handler);
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('pointerdown', handler);
      document.removeEventListener('keydown', handler);
    };
  }, [needsAudioUnlock, setPlaybackEnabled]);

  const handleJoinClick = useCallback(() => {

    // First join the voice room (announce presence)
    void rtc.join();

    // Then send connection request if we have a target player
    if (onRequestConnection && targetPlayerId) {
      onRequestConnection(targetPlayerId);
    } else {
      console.warn('[SeatMediaControls] Cannot send request', {
        hasCallback: !!onRequestConnection,
        hasTarget: !!targetPlayerId
      });
    }
  }, [rtc, onRequestConnection, targetPlayerId]);

  const isIdle = rtc.state === "idle" || rtc.state === "failed" || rtc.state === "closed";

  if (!rtc.featureEnabled) return null;

  return (
    <div className={`inline-flex items-center gap-2 rounded-rc-md border border-rc-line/18 bg-[rgba(7,10,20,0.85)] px-2 py-1 ${className ?? ""}`}>
      {isIdle ? (
        <RcButton
          variant="quiet"
          size="icon-xs"
          className="border-rc-success/50 text-rc-success-ink hover:border-rc-success hover:text-rc-success-ink"
          onClick={handleJoinClick}
          title={FEATURE_AUDIO_ONLY ? "Request audio connection" : "Request video connection"}
        >
          {FEATURE_AUDIO_ONLY ? <Phone className="h-4 w-4" /> : <Video className="h-4 w-4" />}
        </RcButton>
      ) : (
        <button
          onClick={() => rtc.leave()}
          className="h-7 w-7 grid place-items-center rounded-rc-md bg-rc-danger hover:bg-rc-danger-hover text-rc-fg-strong"
          title={FEATURE_AUDIO_ONLY ? "Leave audio" : "Leave call"}
        >
          <PhoneOff className="h-4 w-4" />
        </button>
      )}

      <RcButton
        variant="quiet"
        size="icon-xs"
        onClick={() => rtc.toggleMic()}
        className={MUTED_PRESSED}
        aria-pressed={rtc.micMuted}
        title={rtc.micMuted ? "Unmute mic" : "Mute mic"}
      >
        {rtc.micMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </RcButton>

      {!FEATURE_AUDIO_ONLY && (
        <RcButton
          variant="quiet"
          size="icon-xs"
          onClick={() => rtc.toggleCam()}
          className={MUTED_PRESSED}
          aria-pressed={rtc.camOff}
          title={rtc.camOff ? "Enable camera" : "Disable camera"}
        >
          {rtc.camOff ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
        </RcButton>
      )}

      {effectiveShowSpeakerToggle && (
        <RcButton
          variant="quiet"
          size="icon-xs"
          onClick={togglePlayback}
          className={MUTED_PRESSED}
          aria-pressed={!playbackEnabled}
          title={playbackEnabled ? "Mute speakers" : "Unmute speakers"}
        >
          {playbackEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </RcButton>
      )}

      {/* Device popover */}
      <div className="relative">
        <RcButton
          variant="quiet"
          size="icon-xs"
          onClick={() => setShowDevices((s) => !s)}
          aria-pressed={showDevices}
          title={FEATURE_AUDIO_ONLY ? "Audio devices" : "Audio/Video devices"}
        >
          <Settings className="h-4 w-4" />
        </RcButton>
        {showDevices && (
          <div
            className={`absolute ${menuAlignment === 'right' ? 'right-0' : 'left-0'} top-full mt-1 z-50 rounded-rc-md border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-2 text-rc-fg shadow-rc-panel backdrop-blur-sm min-w-[200px]`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="rc-field-label">Mic</span>
              <CustomSelect
                className="flex-1"
                value={rtc.audioDeviceId ?? ""}
                onChange={(v) => rtc.setAudioDeviceId(v || null)}
                placeholder="Default"
                options={rtc.audioDevices.map((d) => ({
                  value: d.deviceId,
                  label: d.label || `Microphone ${d.deviceId.slice(0, 6)}`,
                }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="rc-field-label">Output</span>
              <CustomSelect
                className="flex-1"
                value={rtc.audioOutputDeviceId ?? ""}
                onChange={(v) => rtc.setAudioOutputDeviceId(v || null)}
                placeholder="System default"
                options={rtc.audioOutputDevices.map((d) => ({
                  value: d.deviceId,
                  label: d.label || `Output ${d.deviceId.slice(0, 6)}`,
                }))}
              />
            </div>
            {!FEATURE_AUDIO_ONLY && (
              <div className="flex items-center gap-2 mt-2">
                <span className="rc-field-label">Cam</span>
                <CustomSelect
                  className="flex-1"
                  value={rtc.videoDeviceId ?? ""}
                  onChange={(v) => rtc.setVideoDeviceId(v || null)}
                  placeholder="Default"
                  options={rtc.videoDevices.map((d) => ({
                    value: d.deviceId,
                    label: d.label || `Camera ${d.deviceId.slice(0, 6)}`,
                  }))}
                />
              </div>
            )}
            <div className="flex items-center justify-end mt-2">
              <RcButton
                variant="quiet"
                size="icon-xs"
                onClick={() => rtc.refreshDevices()}
                title="Refresh devices"
              >
                <RefreshCw className="h-4 w-4" />
              </RcButton>
            </div>
          </div>
        )}
      </div>

      {/* State badge */}
      <span className="font-rc-mono text-[10px] tracking-[0.08em] text-rc-fg-muted ml-1">{rtc.state}</span>

      {renderAudioElement && (
        <>
          {/* Hidden audio element for remote audio */}
          <audio ref={audioRef} autoPlay playsInline className="hidden" />

          {/* Playback unlock helper (shown only if autoplay was blocked) */}
          {needsAudioUnlock && (
            <RcButton
              variant="quiet"
              size="xs"
              onClick={() => {
                const el = audioRef.current;
                if (!el) return;
                el
                  .play()
                  .then(() => {
                    setNeedsAudioUnlock(false);
                    setPlaybackEnabled(true);
                  })
                  .catch(() => setNeedsAudioUnlock(true));
              }}
              className="ml-1 gap-1 px-2 text-[10px]"
              title="Enable audio playback"
            >
              <Volume2 className="h-3.5 w-3.5" /> Enable audio
            </RcButton>
          )}
        </>
      )}
    </div>
  );
}
