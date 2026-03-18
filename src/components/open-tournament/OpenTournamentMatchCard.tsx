"use client";

import { useState } from "react";
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
        ? player2?.id ?? ""
        : winnerId === player1?.id
          ? player2?.id ?? ""
          : player1?.id ?? "";

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

  return (
    <div
      className={`bg-slate-800 border rounded-lg p-4 ${
        isPending
          ? "border-amber-700"
          : isCompleted
            ? "border-slate-600"
            : "border-slate-700"
      }`}
    >
      {/* Players */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex-1">
          <div
            className={`text-sm font-medium ${
              isCompleted && results?.winnerId === player1?.id
                ? "text-green-400"
                : "text-white"
            }`}
          >
            {player1?.name ?? "TBD"}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">vs</div>
          <div
            className={`text-sm font-medium ${
              isCompleted && results?.winnerId === player2?.id
                ? "text-green-400"
                : "text-white"
            }`}
          >
            {player2?.name ?? "TBD"}
          </div>
        </div>

        {/* Status badge */}
        <div className="text-right">
          {isPending && (
            <span className="text-xs px-2 py-0.5 bg-amber-900/50 text-amber-300 border border-amber-700 rounded-full">
              Pending approval
            </span>
          )}
          {isCompleted && (
            <span className="text-xs px-2 py-0.5 bg-slate-700 text-slate-300 border border-slate-600 rounded-full">
              {results?.isDraw ? "Draw" : `${(results?.winnerId === player1?.id ? player1?.name : player2?.name) ?? "?"} won`}
            </span>
          )}
          {!isCompleted && !isPending && (
            <span className="text-xs px-2 py-0.5 bg-blue-900/50 text-blue-300 border border-blue-700 rounded-full">
              pending
            </span>
          )}
          {isCompleted && results?.source ? (
            <div className="text-xs text-slate-500 mt-1 capitalize">
              via {String(results.source)}
            </div>
          ) : null}
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-400 mb-2">{error}</div>
      )}

      {/* Host approval buttons */}
      {isPending && isHost && (
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => handleApproval(true)}
            disabled={submitting}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-3 py-1.5 rounded text-xs"
          >
            Approve
          </button>
          <button
            onClick={() => handleApproval(false)}
            disabled={submitting}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-3 py-1.5 rounded text-xs"
          >
            Reject
          </button>
        </div>
      )}

      {/* Report result button */}
      {!isCompleted && !isPending && !showReportForm && (
        <button
          onClick={() => setShowReportForm(true)}
          className="w-full bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded text-xs"
        >
          Report Result
        </button>
      )}

      {/* Report result form */}
      {!isCompleted && !isPending && showReportForm && (
        <div className="space-y-2 mt-2 pt-2 border-t border-slate-700">
          {/* Source */}
          <div className="flex gap-2">
            {settings.matchResolution.allowRealms && (
              <button
                className={`px-2 py-1 rounded text-xs ${
                  source === "realms"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-700 text-slate-300"
                }`}
                onClick={() => setSource("realms")}
              >
                Realms
              </button>
            )}
            {settings.matchResolution.allowManualReport && (
              <>
                <button
                  className={`px-2 py-1 rounded text-xs ${
                    source === "tts"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-700 text-slate-300"
                  }`}
                  onClick={() => setSource("tts")}
                >
                  TTS
                </button>
                <button
                  className={`px-2 py-1 rounded text-xs ${
                    source === "manual"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-700 text-slate-300"
                  }`}
                  onClick={() => setSource("manual")}
                >
                  Manual
                </button>
              </>
            )}
          </div>

          {/* Winner selection */}
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={isDraw}
                onChange={(e) => {
                  setIsDraw(e.target.checked);
                  if (e.target.checked) setWinnerId("");
                }}
                className="accent-blue-500"
              />
              Draw
            </label>
            {!isDraw && (
              <div className="flex gap-2">
                {match.players.map((p) => (
                  <button
                    key={p.id}
                    className={`flex-1 px-2 py-1 rounded text-xs ${
                      winnerId === p.id
                        ? "bg-green-600 text-white"
                        : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                    }`}
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
            <button
              onClick={handleSubmitResult}
              disabled={submitting || (!winnerId && !isDraw)}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-3 py-1.5 rounded text-xs"
            >
              {submitting ? "Submitting..." : "Submit Result"}
            </button>
            <button
              onClick={() => setShowReportForm(false)}
              className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
