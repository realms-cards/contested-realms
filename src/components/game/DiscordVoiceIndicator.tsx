/**
 * Shows Discord voice channel status in online matches.
 * Displays when both players have Discord linked and a voice channel is available.
 */

"use client";

import { useState, useEffect } from "react";

interface DiscordVoiceIndicatorProps {
  matchId: string;
  className?: string;
}

export function DiscordVoiceIndicator({
  matchId,
  className = "",
}: DiscordVoiceIndicatorProps) {
  const [voiceUrl, _setVoiceUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if there's a Discord voice channel for this match
    // This would be stored in match metadata or fetched from an API
    // For now, we'll just show a placeholder
    setLoading(false);
  }, [matchId]);

  if (loading || !voiceUrl) {
    return null;
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg ${className}`}
    >
      <svg
        className="w-5 h-5 text-indigo-400"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" />
      </svg>
      <span className="text-sm text-indigo-200">Discord Voice Available</span>
      <a
        href={voiceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto px-2 py-1 text-xs bg-indigo-500 hover:bg-indigo-600 text-white rounded transition-colors"
      >
        Join
      </a>
    </div>
  );
}
