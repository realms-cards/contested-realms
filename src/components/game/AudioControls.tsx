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
import { RcButton } from "@/components/ui/rc-button";
import { useMusicPlayer } from "@/hooks/useMusicPlayer";
import type { SfxGroup } from "@/lib/audio/soundManager";
import { useSound } from "@/lib/contexts/SoundContext";
import { MUSIC_TRACKS } from "@/lib/music/music-config";

const SFX_GROUP_OPTIONS: ReadonlyArray<{ group: SfxGroup; label: string; hint: string }> = [
  { group: "board", label: "Board", hint: "Cards, combat, dice and turn changes" },
  { group: "alerts", label: "Alerts", hint: "Your turn, invites, timers and match results" },
  { group: "interface", label: "Interface", hint: "Selections, targeting, denied actions and draft picks" },
];

interface AudioControlsProps {
  /** Whether to enable music player (disabled during drafts) */
  enableMusic?: boolean;
}

export default function AudioControls({ enableMusic = true }: AudioControlsProps) {
  // Always call hooks unconditionally (React Hooks rules)
  const [musicState, musicControls] = useMusicPlayer();
  const { volume: soundVolume, setVolume: setSoundVolume, mix, setMixGroup } = useSound();
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

  // Music is on but the browser refused autoplay; any click/keypress will start it.
  const waitingForGesture =
    enableMusic &&
    musicState.isEnabled &&
    musicState.autoplayBlocked &&
    !musicState.isPlaying;

  return (
    <div ref={containerRef} className="relative">
      {/* Collapsed State: Just note icon */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className={`hover:text-rc-fg-strong transition-colors p-1 ${
            waitingForGesture ? "animate-pulse text-rc-accent-ring" : "text-rc-fg-muted"
          }`}
          title={
            waitingForGesture
              ? "Music is ready — click anywhere to start it"
              : "Audio controls (Music & Sound)"
          }
          aria-label="Open audio controls"
        >
          <Music className="w-4 h-4" />
        </button>
      )}

      {/* Expanded State: Full controls */}
      {isExpanded && (
        <div
          className="absolute top-full right-0 mt-2 p-4 rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] text-rc-fg backdrop-blur-md shadow-rc-panel min-w-[320px] z-50"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={() => setIsExpanded(false)}
            className="absolute top-2 right-2 rounded-rc-md px-1 text-rc-fg-muted hover:bg-rc-line/6 hover:text-rc-fg-strong transition-colors"
            aria-label="Close audio controls"
          >
            ×
          </button>

          {/* Music Section - Only show if music is enabled */}
          {enableMusic && musicState && musicControls && (
            <>
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Music className="w-4 h-4 text-rc-accent-link" />
                  <span className="rc-eyebrow">Music</span>
                </div>

                {/* Current Track */}
                <div className="font-rc-sans text-xs text-rc-fg-muted mb-2">
                  {musicState.currentTrack.title}
                  <span className="ml-2 font-rc-mono tabular-nums text-rc-fg-subtle">
                    ({musicState.currentTrackIndex + 1} / {MUSIC_TRACKS.length})
                  </span>
                </div>

                {/* Playback Controls */}
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={musicControls.previousTrack}
                    className="p-1.5 rounded-rc-md text-rc-fg-muted hover:bg-rc-line/6 hover:text-rc-fg-strong transition-colors"
                    title="Previous track"
                    aria-label="Previous track"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>

                  <RcButton
                    size="icon-xs"
                    onClick={musicControls.togglePlay}
                    className="h-[34px] w-[34px] rounded-full"
                    title={musicState.isPlaying ? "Pause" : "Play"}
                    aria-label={musicState.isPlaying ? "Pause music" : "Play music"}
                  >
                    {musicState.isPlaying ? (
                      <Pause className="w-4 h-4" fill="currentColor" />
                    ) : (
                      <Play className="w-4 h-4" fill="currentColor" />
                    )}
                  </RcButton>

                  <button
                    onClick={musicControls.nextTrack}
                    className="p-1.5 rounded-rc-md text-rc-fg-muted hover:bg-rc-line/6 hover:text-rc-fg-strong transition-colors"
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
                    className="text-rc-fg-muted hover:text-rc-fg-strong transition-colors"
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
                    className="rc-range flex-1"
                    title={`Music volume: ${Math.round(musicState.volume * 100)}%`}
                    aria-label="Music volume slider"
                  />

                  <div className="font-rc-mono text-xs tabular-nums text-rc-fg-subtle w-8 text-right">
                    {Math.round(musicState.volume * 100)}%
                  </div>
                </div>

                {/* Track List */}
                <div className="mt-2 relative">
                  <RcButton
                    variant="quiet"
                    size="xs"
                    onClick={() => setShowTrackList(!showTrackList)}
                    className="h-[30px] w-full justify-start rounded-rc-md px-2 font-rc-mono tracking-[0.08em]"
                    aria-label="Select track"
                    aria-pressed={showTrackList}
                  >
                    Track List
                  </RcButton>

                  {showTrackList && (
                    <div className="thin-scrollbar absolute top-full mt-2 left-0 right-0 max-h-48 overflow-y-auto rounded-rc-md border border-rc-line/18 bg-[rgba(9,13,25,0.95)] backdrop-blur-md shadow-rc-panel z-10">
                      {MUSIC_TRACKS.map((track, index) => (
                        <button
                          key={track.filename}
                          onClick={() => {
                            musicControls.selectTrack(index);
                            setShowTrackList(false);
                          }}
                          className={`w-full px-3 py-2 text-left font-rc-sans text-xs hover:bg-rc-accent/8 transition-colors ${
                            index === musicState.currentTrackIndex
                              ? "bg-rc-accent/12 text-rc-spark font-medium"
                              : "text-rc-fg-muted hover:text-rc-fg-strong"
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
              <div className="border-t border-rc-line/12 my-3" />
            </>
          )}

          {/* Sound Section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Volume2 className="w-4 h-4 text-rc-accent-link" />
              <span className="rc-eyebrow">
                Sound Effects
              </span>
            </div>

            {/* Sound Volume */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSoundVolume(soundVolume > 0 ? 0 : 0.7)}
                className="text-rc-fg-muted hover:text-rc-fg-strong transition-colors"
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
                className="rc-range flex-1"
                title={`Sound volume: ${Math.round(soundVolume * 100)}%`}
                aria-label="Sound volume slider"
              />

              <div className="font-rc-mono text-xs tabular-nums text-rc-fg-subtle w-8 text-right">
                {Math.round(soundVolume * 100)}%
              </div>
            </div>

            {/* Sound groups */}
            <div
              className="mt-3 flex flex-wrap gap-x-4 gap-y-2"
              role="group"
              aria-label="Sound effect groups"
            >
              {SFX_GROUP_OPTIONS.map((option) => (
                <label
                  key={option.group}
                  className="rc-check select-none"
                  title={option.hint}
                >
                  <input
                    id={`sfx-group-${option.group}`}
                    type="checkbox"
                    checked={mix[option.group]}
                    onChange={(e) => setMixGroup(option.group, e.target.checked)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
