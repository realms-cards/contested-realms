"use client";

import { AlertTriangle } from "lucide-react";
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
  /** Smaller pill sized for compact docks (e.g. the console cluster) */
  compact?: boolean;
  /**
   * "countdown": time remaining against the round limit (timed matches).
   * "elapsed": neutral count-up clock for untimed matches.
   */
  mode?: "countdown" | "elapsed";
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
  compact = false,
  mode = "countdown",
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

    const formatClock = (ms: number): string => {
      const totalSeconds = Math.floor(ms / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      const mmss = `${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`;
      return hours > 0 ? `${hours}:${mmss}` : mmss;
    };

    if (mode === "elapsed") {
      return {
        remainingMs: 0,
        isExpired: false,
        formattedTime: formatClock(Math.max(0, now - startTime)),
        urgency: "normal" as const,
      };
    }

    const roundTimeMs = roundTimeMinutes * 60 * 1000;
    const expiresAt = startTime + roundTimeMs;
    const remaining = Math.max(0, expiresAt - now);
    const expired = remaining === 0;
    const formatted = formatClock(remaining);

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
  }, [
    matchStartedAt,
    roundTimeMinutes,
    warningMinutes,
    mode,
    now,
    isTournamentMatch,
  ]);

  // Trigger callback when time expires
  useEffect(() => {
    if (isExpired && !hasExpired && onTimeExpired) {
      setHasExpired(true);
      onTimeExpired();
    }
  }, [isExpired, hasExpired, onTimeExpired]);

  // Don't render if not a tournament match
  if (!isTournamentMatch) return null;

  // Bare LCD digits: urgency is conveyed through text color only
  const urgencyClasses = {
    normal: "text-white",
    warning: "text-yellow-400",
    critical: "text-red-400 animate-pulse",
    expired: "text-red-500",
  };

  const sizeClasses = compact ? "gap-1 text-xs" : "gap-2 text-sm";
  const iconClass = compact ? "w-3 h-3" : "w-4 h-4";

  return (
    <div
      className={`flex items-center font-mono ${sizeClasses} ${
        extraTurnsMode ? urgencyClasses.expired : urgencyClasses[urgency]
      }`}
      title={
        extraTurnsMode
          ? `Time expired — extra turn ${extraTurnsUsed} of ${extraTurnsTotal}`
          : mode === "elapsed"
            ? "Match time elapsed"
            : `Match time remaining (${roundTimeMinutes} min limit)`
      }
    >
      {extraTurnsMode ? (
        <>
          <AlertTriangle className={iconClass} />
          <span>
            {compact ? "ET" : "Extra Turn"} {extraTurnsUsed}/{extraTurnsTotal}
          </span>
        </>
      ) : (
        <>
          {/* Seven-segment LCD digits with unlit "ghost" segments behind */}
          <span className="relative font-lcd leading-none">
            <span aria-hidden="true" className="absolute inset-0 opacity-15">
              {formattedTime.replace(/\d/g, "8")}
            </span>
            <span className="relative">{formattedTime}</span>
          </span>
          {isExpired && !compact && (
            <span className="text-xs ml-1">(Time!)</span>
          )}
        </>
      )}
    </div>
  );
}

export default TournamentMatchTimer;
