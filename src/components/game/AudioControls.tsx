/**
 * AudioControls Component
 *
 * Compact audio controls for music and sound effects in the status bar.
 * Shows music note icon and volume icon side-by-side.
 * Expands to show full controls on click.
 */

"use client";

import {
  Music,
  Volume2,
  VolumeX,
  Play,
  Pause,
  SkipForward,
  SkipBack,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMusicPlayer } from "@/hooks/useMusicPlayer";
import { useSound } from "@/lib/contexts/SoundContext";
import { MUSIC_TRACKS } from "@/lib/music/music-config";

export default function AudioControls() {
  const [musicState, musicControls] = useMusicPlayer();
  const { volume: soundVolume, setVolume: setSoundVolume } = useSound();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTrackList, setShowTrackList] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Click outside to collapse
  useEffect(() => {
    if (!isExpanded) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsExpanded(false);
        setShowTrackList(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isExpanded]);

  return (
    <div ref={containerRef} className="relative">
      {/* Collapsed State: Just note icon */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="text-white/70 hover:text-white transition-colors p-1"
          title="Audio controls (Music & Sound)"
          aria-label="Open audio controls"
        >
          <Music className="w-4 h-4" />
        </button>
      )}

      {/* Expanded State: Full controls */}
      {isExpanded && (
        <div
          className="absolute top-full right-0 mt-2 p-4 rounded-lg bg-slate-900/95 backdrop-blur-md border border-slate-700/50 shadow-xl min-w-[320px] z-50"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={() => setIsExpanded(false)}
            className="absolute top-2 right-2 text-slate-400 hover:text-white transition-colors"
            aria-label="Close audio controls"
          >
            ×
          </button>

          {/* Music Section */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Music className="w-4 h-4 text-slate-300" />
              <span className="text-sm font-medium text-slate-200">Music</span>
            </div>

            {/* Current Track */}
            <div className="text-xs text-slate-400 mb-2">
              {musicState.currentTrack.title}
              <span className="ml-2">
                ({musicState.currentTrackIndex + 1} / {MUSIC_TRACKS.length})
              </span>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={musicControls.previousTrack}
                className="p-1.5 rounded hover:bg-slate-800/60 text-slate-300 hover:text-slate-100 transition-colors"
                title="Previous track"
                aria-label="Previous track"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  if (!musicState.isEnabled) {
                    musicControls.toggleEnabled();
                  }
                  musicControls.togglePlay();
                }}
                className="p-2 rounded-full bg-slate-700/50 hover:bg-slate-600/50 text-slate-100 transition-colors"
                title={musicState.isPlaying ? "Pause" : "Play"}
                aria-label={musicState.isPlaying ? "Pause music" : "Play music"}
              >
                {musicState.isPlaying ? (
                  <Pause className="w-4 h-4" fill="currentColor" />
                ) : (
                  <Play className="w-4 h-4" fill="currentColor" />
                )}
              </button>

              <button
                onClick={musicControls.nextTrack}
                className="p-1.5 rounded hover:bg-slate-800/60 text-slate-300 hover:text-slate-100 transition-colors"
                title="Next track"
                aria-label="Next track"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            {/* Music Volume */}
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  musicControls.setVolume(musicState.volume > 0 ? 0 : 0.7)
                }
                className="text-slate-300 hover:text-slate-100 transition-colors"
                aria-label={musicState.volume === 0 ? "Unmute music" : "Mute music"}
              >
                {musicState.volume === 0 ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>

              <input
                type="range"
                min="0"
                max="100"
                value={musicState.volume * 100}
                onChange={(e) =>
                  musicControls.setVolume(parseInt(e.target.value) / 100)
                }
                className="flex-1 h-1 rounded-full appearance-none cursor-pointer bg-slate-700
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-slate-300
                  [&::-webkit-slider-thumb]:hover:bg-slate-100 [&::-webkit-slider-thumb]:transition-colors
                  [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:bg-slate-300 [&::-moz-range-thumb]:hover:bg-slate-100
                  [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:transition-colors"
                title={`Music volume: ${Math.round(musicState.volume * 100)}%`}
                aria-label="Music volume slider"
              />

              <div className="text-xs text-slate-400 w-8 text-right">
                {Math.round(musicState.volume * 100)}%
              </div>
            </div>

            {/* Track List */}
            <div className="mt-2 relative">
              <button
                onClick={() => setShowTrackList(!showTrackList)}
                className="w-full px-2 py-1.5 rounded bg-slate-800/40 hover:bg-slate-800/60 border border-slate-700/50 text-xs text-slate-300 text-left transition-colors"
                aria-label="Select track"
              >
                Track List
              </button>

              {showTrackList && (
                <div className="absolute bottom-full mb-2 left-0 right-0 max-h-64 overflow-y-auto bg-slate-900/95 backdrop-blur-md border border-slate-700/50 rounded-lg shadow-xl">
                  {MUSIC_TRACKS.map((track, index) => (
                    <button
                      key={track.filename}
                      onClick={() => {
                        musicControls.selectTrack(index);
                        setShowTrackList(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-xs hover:bg-slate-800/60 transition-colors ${
                        index === musicState.currentTrackIndex
                          ? "bg-slate-700/50 text-slate-100 font-medium"
                          : "text-slate-300"
                      }`}
                    >
                      <div className="truncate">{track.title}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-700/50 my-3" />

          {/* Sound Section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Volume2 className="w-4 h-4 text-slate-300" />
              <span className="text-sm font-medium text-slate-200">
                Sound Effects
              </span>
            </div>

            {/* Sound Volume */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSoundVolume(soundVolume > 0 ? 0 : 0.7)}
                className="text-slate-300 hover:text-slate-100 transition-colors"
                aria-label={soundVolume === 0 ? "Unmute sounds" : "Mute sounds"}
              >
                {soundVolume === 0 ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>

              <input
                type="range"
                min="0"
                max="100"
                value={soundVolume * 100}
                onChange={(e) => setSoundVolume(parseInt(e.target.value) / 100)}
                className="flex-1 h-1 rounded-full appearance-none cursor-pointer bg-slate-700
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-slate-300
                  [&::-webkit-slider-thumb]:hover:bg-slate-100 [&::-webkit-slider-thumb]:transition-colors
                  [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:bg-slate-300 [&::-moz-range-thumb]:hover:bg-slate-100
                  [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:transition-colors"
                title={`Sound volume: ${Math.round(soundVolume * 100)}%`}
                aria-label="Sound volume slider"
              />

              <div className="text-xs text-slate-400 w-8 text-right">
                {Math.round(soundVolume * 100)}%
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
