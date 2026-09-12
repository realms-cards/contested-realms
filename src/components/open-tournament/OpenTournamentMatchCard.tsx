"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { RcButton } from "@/components/ui/rc-button";
import { MATCH_APPROVAL_STATUS } from "@/lib/open-tournament/constants";
import type { OpenTournamentSettings } from "@/lib/open-tournament/types";

interface Match {
  id: string;
  status: string;
  players: Array<{ id: string; name: string }>;
  results: Record<string, unknown> | null;
  completedAt: string | null;
}

interface Props {
  tournamentId: string;
  match: Match;
  isHost: boolean;
  settings: OpenTournamentSettings;
  onRefresh: () => void;
}

export function OpenTournamentMatchCard({
  tournamentId,
  match,
  isHost,
  settings,
  onRefresh,
}: Props) {
  const [showReportForm, setShowReportForm] = useState(false);
  const [winnerId, setWinnerId] = useState("");
  const [isDraw, setIsDraw] = useState(false);
  const [source, setSource] = useState<"realms" | "manual" | "tts">("manual");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const player1 = match.players[0];
  const player2 = match.players[1];
  const results = match.results;
  const approvalStatus = results?.approvalStatus as string | undefined;
  const isPending = approvalStatus === MATCH_APPROVAL_STATUS.PENDING;
  const isCompleted = match.status === "completed";

  const handleSubmitResult = async () => {
    if (!winnerId && !isDraw) return;
    setSubmitting(true);
    setError(null);

    try {
      const loserId = isDraw
        ? (player2?.id ?? "")
        : winnerId === player1?.id
          ? (player2?.id ?? "")
          : (player1?.id ?? "");

      const res = await fetch(
        `/api/open-tournaments/${tournamentId}/matches/${match.id}/result`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            winnerId: isDraw ? player1?.id : winnerId,
            loserId,
            isDraw,
            source,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit result");
      setShowReportForm(false);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproval = async (approved: boolean) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/open-tournaments/${tournamentId}/matches/${match.id}/result`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approved }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to approve");
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  const playerName = (playerId: unknown) =>
    playerId === player1?.id ? player1?.name : player2?.name;

  return (
    <div
      className={`rounded-rc-lg border bg-rc-panel p-4 shadow-rc-panel ${
        isPending ? "border-rc-warning/45" : "border-rc-line/18"
      }`}
    >
      {/* Players */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className={`truncate font-rc-display text-[19px] leading-[1.1] ${
              isCompleted && results?.winnerId === player1?.id
                ? "text-rc-success"
                : "text-rc-fg-strong"
            }`}
          >
            {player1?.name ?? "TBD"}
          </div>
          <div className="my-0.5 font-rc-mono text-[11px] tracking-[0.14em] text-rc-fg-dim">
            vs
          </div>
          <div
            className={`truncate font-rc-display text-[19px] leading-[1.1] ${
              isCompleted && results?.winnerId === player2?.id
                ? "text-rc-success"
                : "text-rc-fg-strong"
            }`}
          >
            {player2?.name ?? "TBD"}
          </div>
        </div>

        {/* Status badge */}
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          {isPending && <Badge tone="warn">Pending approval</Badge>}
          {isCompleted && (
            <Badge tone="ok">
              {results?.isDraw
                ? "Draw"
                : `${playerName(results?.winnerId) ?? "?"} won`}
            </Badge>
          )}
          {!isCompleted && !isPending && <Badge>pending</Badge>}
          {isCompleted && results?.source ? (
            <div className="rc-hint">via {String(results.source)}</div>
          ) : null}
        </div>
      </div>

      {error && (
        <div className="rc-alert mb-2" data-tone="danger">
          {error}
        </div>
      )}

      {/* Host approval buttons */}
      {isPending && isHost && (
        <div className="mb-2 flex gap-2">
          <RcButton
            size="sm"
            onClick={() => handleApproval(true)}
            disabled={submitting}
            className="flex-1"
          >
            Approve
          </RcButton>
          <RcButton
            variant="destructive"
            size="sm"
            onClick={() => handleApproval(false)}
            disabled={submitting}
            className="flex-1"
          >
            Reject
          </RcButton>
        </div>
      )}

      {/* Report result button */}
      {!isCompleted && !isPending && !showReportForm && (
        <RcButton
          variant="outline"
          size="sm"
          onClick={() => setShowReportForm(true)}
          className="w-full"
        >
          Report Result
        </RcButton>
      )}

      {/* Report result form */}
      {!isCompleted && !isPending && showReportForm && (
        <div className="mt-2 space-y-2.5 border-t border-rc-line/12 pt-3">
          {/* Source */}
          <div className="rc-segment">
            {settings.matchResolution.allowRealms && (
              <button
                type="button"
                aria-pressed={source === "realms"}
                onClick={() => setSource("realms")}
              >
                Realms
              </button>
            )}
            {settings.matchResolution.allowManualReport && (
              <>
                <button
                  type="button"
                  aria-pressed={source === "tts"}
                  onClick={() => setSource("tts")}
                >
                  TTS
                </button>
                <button
                  type="button"
                  aria-pressed={source === "manual"}
                  onClick={() => setSource("manual")}
                >
                  Manual
                </button>
              </>
            )}
          </div>

          {/* Winner selection */}
          <div className="space-y-2">
            <label className="rc-check">
              <input
                type="checkbox"
                checked={isDraw}
                onChange={(e) => {
                  setIsDraw(e.target.checked);
                  if (e.target.checked) setWinnerId("");
                }}
              />
              Draw
            </label>
            {!isDraw && (
              <div className="rc-segment">
                {match.players.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={winnerId === p.id}
                    onClick={() => setWinnerId(p.id)}
                  >
                    {p.name} wins
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="flex gap-2">
            <RcButton
              size="sm"
              onClick={handleSubmitResult}
              disabled={submitting || (!winnerId && !isDraw)}
              className="flex-1"
            >
              {submitting ? "Submitting..." : "Submit Result"}
            </RcButton>
            <RcButton
              variant="ghost"
              size="sm"
              onClick={() => setShowReportForm(false)}
            >
              Cancel
            </RcButton>
          </div>
        </div>
      )}
    </div>
  );
}
