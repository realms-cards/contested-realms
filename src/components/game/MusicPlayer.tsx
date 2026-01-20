/**
 * MusicPlayer Component
 *
 * Minimalist collapsible music player for gameplay.
 * Shows a semi-transparent note icon that expands to reveal full controls.
 */

"use client";

import {
  Music,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMusicPlayer } from "@/hooks/useMusicPlayer";
import { MUSIC_TRACKS } from "@/lib/music/music-config";

export default function MusicPlayer() {
  const [state, controls] = useMusicPlayer();
  const containerRef = useRef<HTMLDivElement>(null);
  const [showTrackList, setShowTrackList] = useState(false);

  // Click outside to collapse
  useEffect(() => {
    if (!state.isExpanded) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        controls.setExpanded(false);
        setShowTrackList(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [state.isExpanded, controls]);

  // Handle autoplay blocked - pulse animation
  const isPulsingForAutoplay = state.autoplayBlocked && !state.isPlaying;

  return (
    <div
      ref={containerRef}
      className="fixed bottom-4 right-4 z-50 flex items-end"
      style={{ pointerEvents: "auto" }}
    >
      {/* Collapsed State: Icon Only */}
      {!state.isExpanded && (
        <button
          onClick={controls.toggleExpanded}
          className={`
            flex items-center justify-center w-12 h-12 rounded-full
            bg-slate-900/50 backdrop-blur-sm
            border border-slate-700/50
            transition-all duration-200
            hover:bg-slate-800/60 hover:border-slate-600/50
            ${isPulsingForAutoplay ? "animate-pulse" : ""}
          `}
          title={
            isPulsingForAutoplay
              ? "Click to enable music"
              : state.isEnabled
              ? "Music player (click to open)"
              : "Music disabled (click to open)"
          }
          aria-label="Open music player"
        >
          <Music
            className={`w-6 h-6 text-slate-300 transition-opacity ${
              state.volume === 0 ? "line-through" : ""
            }`}
            style={{ opacity: 0.5 }}
            strokeWidth={state.volume === 0 ? 1.5 : 2}
          />
          {state.volume === 0 && (
            <div
              className="absolute w-8 h-0.5 bg-slate-300 rotate-45"
              style={{ opacity: 0.5 }}
            />
          )}
        </button>
      )}

      {/* Expanded State: Full Controls */}
      {state.isExpanded && (
        <div
          className="
            flex flex-col gap-3 p-4 rounded-lg
            bg-slate-900/80 backdrop-blur-md
            border border-slate-700/50
            shadow-xl
            min-w-[280px]
          "
        >
          {/* Header with Icon and Track Name */}
          <div className="flex items-center gap-3">
            <button
              onClick={controls.toggleExpanded}
              className="
                flex items-center justify-center w-8 h-8 rounded
                hover:bg-slate-800/60 transition-colors
              "
              title="Collapse player"
              aria-label="Collapse music player"
            >
              <Music
                className="w-5 h-5 text-slate-300"
                style={{ opacity: 0.5 }}
              />
            </button>

            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-slate-200 truncate">
                {state.currentTrack.title}
              </div>
              <div className="text-xs text-slate-400">
                {state.currentTrackIndex + 1} / {MUSIC_TRACKS.length}
              </div>
            </div>
          </div>

          {/* Autoplay Blocked Message */}
          {state.autoplayBlocked && !state.isPlaying && (
            <div className="text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">
              Click play to start music
            </div>
          )}

          {/* Playback Controls */}
          <div className="flex items-center gap-2 justify-center">
            {/* Previous Track */}
            <button
              onClick={controls.previousTrack}
              className="
                flex items-center justify-center w-8 h-8 rounded
                hover:bg-slate-800/60 transition-colors
                text-slate-300 hover:text-slate-100
              "
              title="Previous track"
              aria-label="Previous track"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            {/* Play/Pause */}
            <button
              onClick={() => {
                if (!state.isEnabled) {
                  controls.toggleEnabled();
                }
                controls.togglePlay();
              }}
              className="
                flex items-center justify-center w-10 h-10 rounded-full
                bg-slate-700/50 hover:bg-slate-600/50 transition-colors
                text-slate-100
              "
              title={state.isPlaying ? "Pause" : "Play"}
              aria-label={state.isPlaying ? "Pause music" : "Play music"}
            >
              {state.isPlaying ? (
                <Pause className="w-5 h-5" fill="currentColor" />
              ) : (
                <Play className="w-5 h-5" fill="currentColor" />
              )}
            </button>

            {/* Next Track */}
            <button
              onClick={controls.nextTrack}
              className="
                flex items-center justify-center w-8 h-8 rounded
                hover:bg-slate-800/60 transition-colors
                text-slate-300 hover:text-slate-100
              "
              title="Next track"
              aria-label="Next track"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                controls.setVolume(state.volume > 0 ? 0 : 0.7)
              }
              className="
                flex items-center justify-center w-6 h-6 rounded
                hover:bg-slate-800/60 transition-colors
                text-slate-300 hover:text-slate-100
              "
              title={state.volume === 0 ? "Unmute" : "Mute"}
              aria-label={state.volume === 0 ? "Unmute" : "Mute"}
            >
              {state.volume === 0 ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>

            <input
              type="range"
              min="0"
              max="100"
              value={state.volume * 100}
              onChange={(e) => controls.setVolume(parseInt(e.target.value) / 100)}
              className="
                flex-1 h-1 rounded-full appearance-none cursor-pointer
                bg-slate-700
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-3
                [&::-webkit-slider-thumb]:h-3
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-slate-300
                [&::-webkit-slider-thumb]:hover:bg-slate-100
                [&::-webkit-slider-thumb]:transition-colors
                [&::-moz-range-thumb]:w-3
                [&::-moz-range-thumb]:h-3
                [&::-moz-range-thumb]:rounded-full
                [&::-moz-range-thumb]:bg-slate-300
                [&::-moz-range-thumb]:hover:bg-slate-100
                [&::-moz-range-thumb]:border-0
                [&::-moz-range-thumb]:transition-colors
              "
              title={`Volume: ${Math.round(state.volume * 100)}%`}
              aria-label="Volume slider"
            />

            <div className="text-xs text-slate-400 w-8 text-right">
              {Math.round(state.volume * 100)}%
            </div>
          </div>

          {/* Track List Selector */}
          <div className="relative">
            <button
              onClick={() => setShowTrackList(!showTrackList)}
              className="
                w-full px-3 py-2 rounded
                bg-slate-800/40 hover:bg-slate-800/60
                border border-slate-700/50
                text-xs text-slate-300
                text-left
                transition-colors
              "
              aria-label="Select track"
            >
              Track List
            </button>

            {showTrackList && (
              <div
                className="
                  absolute bottom-full mb-2 left-0 right-0
                  max-h-48 overflow-y-auto
                  bg-slate-900/95 backdrop-blur-md
                  border border-slate-700/50
                  rounded-lg shadow-xl
                "
              >
                {MUSIC_TRACKS.map((track, index) => (
                  <button
                    key={track.filename}
                    onClick={() => {
                      controls.selectTrack(index);
                      setShowTrackList(false);
                    }}
                    className={`
                      w-full px-3 py-2 text-left text-xs
                      hover:bg-slate-800/60 transition-colors
                      ${
                        index === state.currentTrackIndex
                          ? "bg-slate-700/50 text-slate-100 font-medium"
                          : "text-slate-300"
                      }
                    `}
                  >
                    <div className="truncate">{track.title}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Enabled Toggle */}
          <button
            onClick={controls.toggleEnabled}
            className={`
              w-full px-3 py-1.5 rounded text-xs font-medium
              transition-colors
              ${
                state.isEnabled
                  ? "bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border border-emerald-500/30"
                  : "bg-slate-700/30 text-slate-400 hover:bg-slate-700/50 border border-slate-600/30"
              }
            `}
          >
            Music {state.isEnabled ? "Enabled" : "Disabled"}
          </button>
        </div>
      )}
    </div>
  );
}
