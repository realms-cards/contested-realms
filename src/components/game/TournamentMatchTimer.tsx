"use client";

import { Clock, AlertTriangle } from "lucide-react";
import { useEffect, useState, useMemo } from "react";

interface TournamentMatchTimerProps {
  /** Match start time (timestamp) */
  matchStartedAt?: number | string | null;
  /** Round time limit in minutes (default 45) */
  roundTimeMinutes?: number;
  /** Whether this is a tournament match */
  isTournamentMatch?: boolean;
  /** Current extra turns state */
  extraTurnsMode?: boolean;
  extraTurnsRemaining?: number;
  /** Callback when time expires */
  onTimeExpired?: () => void;
}

export function TournamentMatchTimer({
  matchStartedAt,
  roundTimeMinutes = 45,
  isTournamentMatch = false,
  extraTurnsMode = false,
  extraTurnsRemaining = 5,
  onTimeExpired,
}: TournamentMatchTimerProps) {
  const [now, setNow] = useState(Date.now());
  const [hasExpired, setHasExpired] = useState(false);

  // Update time every second
  useEffect(() => {
    if (!isTournamentMatch) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isTournamentMatch]);

  const { isExpired, formattedTime, urgency } = useMemo(() => {
    if (!matchStartedAt || !isTournamentMatch) {
      return {
        remainingMs: 0,
        isExpired: false,
        formattedTime: "--:--",
        urgency: "normal" as const,
      };
    }

    const startTime =
      typeof matchStartedAt === "number"
        ? matchStartedAt
        : new Date(matchStartedAt).getTime();
    const roundTimeMs = roundTimeMinutes * 60 * 1000;
    const expiresAt = startTime + roundTimeMs;
    const remaining = Math.max(0, expiresAt - now);
    const expired = remaining === 0;

    // Format as MM:SS
    const totalSeconds = Math.floor(remaining / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const formatted = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

    // Determine urgency level
    let urgencyLevel: "normal" | "warning" | "critical" | "expired" = "normal";
    if (expired) {
      urgencyLevel = "expired";
    } else if (remaining < 5 * 60 * 1000) {
      // Less than 5 minutes
      urgencyLevel = "critical";
    } else if (remaining < 15 * 60 * 1000) {
      // Less than 15 minutes
      urgencyLevel = "warning";
    }

    return {
      remainingMs: remaining,
      isExpired: expired,
      formattedTime: formatted,
      urgency: urgencyLevel,
    };
  }, [matchStartedAt, roundTimeMinutes, now, isTournamentMatch]);

  // Trigger callback when time expires
  useEffect(() => {
    if (isExpired && !hasExpired && onTimeExpired) {
      setHasExpired(true);
      onTimeExpired();
    }
  }, [isExpired, hasExpired, onTimeExpired]);

  // Don't render if not a tournament match
  if (!isTournamentMatch) return null;

  const urgencyClasses = {
    normal: "bg-slate-800/80 text-white",
    warning: "bg-yellow-600/90 text-white",
    critical: "bg-red-600/90 text-white animate-pulse",
    expired: "bg-red-700/90 text-white",
  };

  return (
    <div
      className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm font-mono shadow-lg ${urgencyClasses[urgency]}`}
    >
      {extraTurnsMode ? (
        <>
          <AlertTriangle className="w-4 h-4" />
          <span>Extra Turns: {extraTurnsRemaining}</span>
        </>
      ) : (
        <>
          <Clock className="w-4 h-4" />
          <span>{formattedTime}</span>
          {isExpired && <span className="text-xs ml-1">(Time!)</span>}
        </>
      )}
    </div>
  );
}

export default TournamentMatchTimer;
