"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { RcButton } from "@/components/ui/rc-button";
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
    <div className="fixed right-4 top-4 z-[9998] flex max-w-sm flex-col gap-2">
      {assignments.map((assignment) => (
        <div
          key={assignment.id}
          className="rc-panel animate-slide-in border-rc-accent/45 p-4"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="rc-eyebrow">Match ready</div>
              <div className="mt-1.5 font-rc-sans text-sm text-rc-fg">
                {assignment.opponentName
                  ? `Your match vs ${assignment.opponentName} is ready`
                  : "Your tournament match is ready"}
              </div>
              {joinErrors[assignment.id] && (
                <div className="mt-2 font-rc-mono text-[11px] tracking-[0.1em] text-rc-warning">
                  {joinErrors[assignment.id]}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <RcButton
                  size="sm"
                  onClick={() => handleJoinMatch(assignment)}
                  disabled={joining === assignment.id}
                >
                  {joining === assignment.id
                    ? "Joining…"
                    : joinErrors[assignment.id]
                      ? "Retry"
                      : "Join Match"}
                </RcButton>
                <RcButton
                  size="sm"
                  variant="ghost"
                  onClick={() => removeAssignment(assignment.id)}
                >
                  Dismiss
                </RcButton>
              </div>
            </div>
            <button
              type="button"
              onClick={() => removeAssignment(assignment.id)}
              aria-label="Dismiss"
              className="-mr-1 -mt-1 cursor-pointer rounded-rc-md px-1.5 text-lg leading-none text-rc-fg-muted transition-colors hover:bg-rc-line/6 hover:text-rc-accent-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rc-accent-ring"
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
