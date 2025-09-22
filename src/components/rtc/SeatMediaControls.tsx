"use client";

import { Camera, CameraOff, Mic, MicOff, RefreshCw, Settings, Video, PhoneOff, Volume2, VolumeX, Phone } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FEATURE_AUDIO_ONLY } from '@/lib/flags';

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
}: {
  rtc: SeatRtcLike;
  className?: string;
  playbackEnabled?: boolean;
  onTogglePlayback?: (next: boolean) => void;
  renderAudioElement?: boolean;
  showSpeakerToggle?: boolean;
  menuAlignment?: 'left' | 'right';
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

  const isIdle = rtc.state === "idle" || rtc.state === "failed" || rtc.state === "closed";

  if (!rtc.featureEnabled) return null;

  return (
    <div className={`inline-flex items-center gap-2 bg-black/55 rounded-lg px-2 py-1 ring-1 ring-white/10 ${className ?? ""}`}>
      {isIdle ? (
        <button
          onClick={() => rtc.join()}
          className="h-7 w-7 grid place-items-center rounded bg-green-600 hover:bg-green-700 text-white"
          title={FEATURE_AUDIO_ONLY ? "Join audio" : "Join video"}
        >
          {FEATURE_AUDIO_ONLY ? <Phone className="h-4 w-4" /> : <Video className="h-4 w-4" />}
        </button>
      ) : (
        <button
          onClick={() => rtc.leave()}
          className="h-7 w-7 grid place-items-center rounded bg-red-600 hover:bg-red-700 text-white"
          title={FEATURE_AUDIO_ONLY ? "Leave audio" : "Leave call"}
        >
          <PhoneOff className="h-4 w-4" />
        </button>
      )}

      <button
        onClick={() => rtc.toggleMic()}
        className={`h-7 w-7 grid place-items-center rounded ${rtc.micMuted ? "bg-yellow-700" : "bg-slate-700 hover:bg-slate-600"} text-white`}
        title={rtc.micMuted ? "Unmute mic" : "Mute mic"}
      >
        {rtc.micMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </button>

      {!FEATURE_AUDIO_ONLY && (
        <button
          onClick={() => rtc.toggleCam()}
          className={`h-7 w-7 grid place-items-center rounded ${rtc.camOff ? "bg-yellow-700" : "bg-slate-700 hover:bg-slate-600"} text-white`}
          title={rtc.camOff ? "Enable camera" : "Disable camera"}
        >
          {rtc.camOff ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
        </button>
      )}

      {effectiveShowSpeakerToggle && (
        <button
          onClick={togglePlayback}
          className={`h-7 w-7 grid place-items-center rounded ${playbackEnabled ? "bg-slate-700 hover:bg-slate-600" : "bg-yellow-700"} text-white`}
          title={playbackEnabled ? "Mute speakers" : "Unmute speakers"}
        >
          {playbackEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>
      )}

      {/* Device popover */}
      <div className="relative">
        <button
          onClick={() => setShowDevices((s) => !s)}
          className="h-7 w-7 grid place-items-center rounded bg-slate-700 hover:bg-slate-600 text-white"
          title={FEATURE_AUDIO_ONLY ? "Audio devices" : "Audio/Video devices"}
        >
          <Settings className="h-4 w-4" />
        </button>
        {showDevices && (
          <div
            className={`absolute ${menuAlignment === 'right' ? 'right-0' : 'left-0'} top-full mt-1 z-50 bg-black/85 ring-1 ring-white/15 rounded-md p-2 backdrop-blur-sm min-w-[200px]`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] uppercase tracking-wide text-white/60">Mic</span>
              <select
                className="flex-1 text-xs bg-slate-800 text-slate-100 rounded px-1 py-0.5"
                value={rtc.audioDeviceId ?? ""}
                onChange={(e) => rtc.setAudioDeviceId(e.target.value || null)}
                title="Select microphone"
              >
                <option value="">Default</option>
                {rtc.audioDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-white/60">Output</span>
              <select
                className="flex-1 text-xs bg-slate-800 text-slate-100 rounded px-1 py-0.5"
                value={rtc.audioOutputDeviceId ?? ""}
                onChange={(e) => rtc.setAudioOutputDeviceId(e.target.value || null)}
                title="Select speakers"
              >
                <option value="">System default</option>
                {rtc.audioOutputDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Output ${d.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            </div>
            {!FEATURE_AUDIO_ONLY && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] uppercase tracking-wide text-white/60">Cam</span>
                <select
                  className="flex-1 text-xs bg-slate-800 text-slate-100 rounded px-1 py-0.5"
                  value={rtc.videoDeviceId ?? ""}
                  onChange={(e) => rtc.setVideoDeviceId(e.target.value || null)}
                  title="Select camera"
                >
                  <option value="">Default</option>
                  {rtc.videoDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-center justify-end mt-2">
              <button
                onClick={() => rtc.refreshDevices()}
                className="h-7 w-7 grid place-items-center rounded bg-slate-700 hover:bg-slate-600 text-white"
                title="Refresh devices"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* State badge */}
      <span className="text-[10px] text-slate-300 ml-1">{rtc.state}</span>

      {renderAudioElement && (
        <>
          {/* Hidden audio element for remote audio */}
          <audio ref={audioRef} autoPlay playsInline className="hidden" />

          {/* Playback unlock helper (shown only if autoplay was blocked) */}
          {needsAudioUnlock && (
            <button
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
              className="ml-1 h-7 px-2 inline-flex items-center gap-1 rounded bg-amber-600 hover:bg-amber-700 text-white text-[10px]"
              title="Enable audio playback"
            >
              <Volume2 className="h-3.5 w-3.5" /> Enable audio
            </button>
          )}
        </>
      )}
    </div>
  );
}
