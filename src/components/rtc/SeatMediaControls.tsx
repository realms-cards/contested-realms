"use client";

import { Camera, CameraOff, Mic, MicOff, RefreshCw, Settings, Video, PhoneOff, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  audioDeviceId: string | null;
  videoDeviceId: string | null;
  setAudioDeviceId: (id: string | null) => void;
  setVideoDeviceId: (id: string | null) => void;
  refreshDevices: () => void;
  // Streams exposed by useMatchWebRTC
  localStream?: MediaStream | null;
  remoteStream: MediaStream | null;
};

export default function SeatMediaControls({ rtc, className }: { rtc: SeatRtcLike; className?: string }) {
  const [showDevices, setShowDevices] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);

  // Attach remote audio stream for non-spatial playback
  useEffect(() => {
    if (!rtc.featureEnabled) return;
    const el = audioRef.current;
    if (!el) return;
    try {
      if (rtc.remoteStream) {
        el.srcObject = rtc.remoteStream as unknown as MediaStream;
        const p = el.play();
        if (p && typeof (p as Promise<void>).then === "function") {
          p.catch(() => {
            // Likely autoplay gating; show unlock button
            setNeedsAudioUnlock(true);
          });
        }
      } else {
        el.pause();
        el.srcObject = null;
        setNeedsAudioUnlock(false);
      }
    } catch {
      // ignore
    }
  }, [rtc.featureEnabled, rtc.remoteStream]);

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
          {FEATURE_AUDIO_ONLY ? <Mic className="h-4 w-4" /> : <Video className="h-4 w-4" />}
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
          <div className="absolute left-0 top-full mt-1 z-50 bg-black/85 ring-1 ring-white/15 rounded-md p-2 backdrop-blur-sm min-w-[200px]">
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
            {!FEATURE_AUDIO_ONLY && (
              <div className="flex items-center gap-2">
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
                <button
                  onClick={() => rtc.refreshDevices()}
                  className="ml-1 h-7 w-7 grid place-items-center rounded bg-slate-700 hover:bg-slate-600 text-white"
                  title="Refresh devices"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* State badge */}
      <span className="text-[10px] text-slate-300 ml-1">{rtc.state}</span>

      {/* Hidden audio element for remote audio */}
      <audio ref={audioRef} autoPlay playsInline muted={false} className="hidden" />

      {/* Playback unlock helper (shown only if autoplay was blocked) */}
      {needsAudioUnlock && (
        <button
          onClick={() => {
            const el = audioRef.current;
            if (!el) return;
            el.play().then(() => setNeedsAudioUnlock(false)).catch(() => setNeedsAudioUnlock(true));
          }}
          className="ml-1 h-7 px-2 inline-flex items-center gap-1 rounded bg-amber-600 hover:bg-amber-700 text-white text-[10px]"
          title="Enable audio playback"
        >
          <Volume2 className="h-3.5 w-3.5" /> Enable audio
        </button>
      )}
    </div>
  );
}
