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
  /** Minutes remaining at which the timer switches to warning colors (default 15) */
  warningMinutes?: number;
  /** Current extra turns state */
  extraTurnsMode?: boolean;
  /** 1-based index of the extra turn currently being played */
  extraTurnsUsed?: number;
  /** Total number of extra turns granted after time */
  extraTurnsTotal?: number;
  /** Callback when time expires */
  onTimeExpired?: () => void;
}

export function TournamentMatchTimer({
  matchStartedAt,
  roundTimeMinutes = 45,
  isTournamentMatch = false,
  warningMinutes = 15,
  extraTurnsMode = false,
  extraTurnsUsed = 1,
  extraTurnsTotal = 5,
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

    // Determine urgency level; critical kicks in at 5 minutes (or earlier
    // when the configured warning threshold is below that).
    const warningMs = Math.max(1, warningMinutes) * 60 * 1000;
    const criticalMs = Math.min(5 * 60 * 1000, warningMs);
    let urgencyLevel: "normal" | "warning" | "critical" | "expired" = "normal";
    if (expired) {
      urgencyLevel = "expired";
    } else if (remaining < criticalMs) {
      urgencyLevel = "critical";
    } else if (remaining < warningMs) {
      urgencyLevel = "warning";
    }

    return {
      remainingMs: remaining,
      isExpired: expired,
      formattedTime: formatted,
      urgency: urgencyLevel,
    };
  }, [matchStartedAt, roundTimeMinutes, warningMinutes, now, isTournamentMatch]);

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
      className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm font-mono shadow-lg ${
        extraTurnsMode ? urgencyClasses.expired : urgencyClasses[urgency]
      }`}
    >
      {extraTurnsMode ? (
        <>
          <AlertTriangle className="w-4 h-4" />
          <span>
            Extra Turn {extraTurnsUsed}/{extraTurnsTotal}
          </span>
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
