"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { prepareTournamentMatchBootstrap } from "@/lib/tournament/matchBootstrap";

interface MatchAssignment {
  id: string;
  tournamentId: string;
  matchId: string;
  opponentName: string | null;
}

/**
 * Global listener for tournament match assignments.
 * Shows a persistent toast when the user is assigned a match during a tournament round.
 * Should be placed in the root layout alongside TournamentInviteListener.
 */
export default function TournamentMatchPrompt() {
  const [assignments, setAssignments] = useState<MatchAssignment[]>([]);
  const [mounted, setMounted] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [joinErrors, setJoinErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  const removeAssignment = useCallback((id: string) => {
    setAssignments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleJoinMatch = useCallback(
    async (assignment: MatchAssignment) => {
      setJoining(assignment.id);
      setJoinErrors((prev) => ({ ...prev, [assignment.id]: "" }));
      const result = await prepareTournamentMatchBootstrap(
        assignment.tournamentId,
        assignment.matchId,
      );
      if (!result.ok) {
        // Keep the toast around so the player can retry once the match is ready
        setJoinErrors((prev) => ({ ...prev, [assignment.id]: result.reason }));
        setJoining(null);
        return;
      }
      removeAssignment(assignment.id);
      window.location.href = `/online/play/${encodeURIComponent(assignment.matchId)}`;
    },
    [removeAssignment],
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | {
            tournamentId?: string;
            matchId?: string;
            opponentName?: string | null;
          }
        | undefined;
      if (!detail?.matchId || !detail?.tournamentId) return;

      const id = `${detail.matchId}-${Date.now()}`;

      // Avoid duplicate assignments for the same match
      setAssignments((prev) => {
        if (prev.some((a) => a.matchId === detail.matchId)) return prev;
        return [
          ...prev,
          {
            id,
            tournamentId: detail.tournamentId as string,
            matchId: detail.matchId as string,
            opponentName: detail.opponentName ?? null,
          },
        ];
      });
    };

    window.addEventListener(
      "tournament:matchAssigned",
      handler as EventListener,
    );
    return () =>
      window.removeEventListener(
        "tournament:matchAssigned",
        handler as EventListener,
      );
  }, []);

  if (!mounted || assignments.length === 0) return null;

  return createPortal(
    <div className="fixed top-4 right-4 z-[9998] flex flex-col gap-2 max-w-sm">
      {assignments.map((assignment) => (
        <div
          key={assignment.id}
          className="bg-slate-900 border-2 border-emerald-500 rounded-lg shadow-xl p-4 animate-slide-in"
        >
          <div className="flex items-start gap-3">
            <div className="text-2xl">&#9876;&#65039;</div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-emerald-400">
                Match Ready!
              </div>
              <div className="text-sm text-white/80 mt-1">
                {assignment.opponentName
                  ? `Your match vs ${assignment.opponentName} is ready`
                  : "Your tournament match is ready"}
              </div>
              {joinErrors[assignment.id] && (
                <div className="text-xs text-amber-300 mt-2">
                  {joinErrors[assignment.id]}
                </div>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => handleJoinMatch(assignment)}
                  disabled={joining === assignment.id}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-sm font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {joining === assignment.id
                    ? "Joining…"
                    : joinErrors[assignment.id]
                      ? "Retry"
                      : "Join Match"}
                </button>
                <button
                  onClick={() => removeAssignment(assignment.id)}
                  className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded text-sm text-white/70"
                >
                  Dismiss
                </button>
              </div>
            </div>
            <button
              onClick={() => removeAssignment(assignment.id)}
              className="text-white/50 hover:text-white text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
}
