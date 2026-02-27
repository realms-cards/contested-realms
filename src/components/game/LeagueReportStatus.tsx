"use client";

import { Check, Loader2, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";

const LEAGUE_EMOJIS: Record<string, string> = {
  "sorcerers-summit": "\u26F0\uFE0F",
};

interface LeagueReport {
  leagueName: string;
  leagueSlug: string;
  status: "pending" | "sent" | "failed";
}

interface LeagueReportStatusProps {
  matchId: string;
}

interface ReportResponse {
  reports: Array<{
    leagueSlug: string;
    leagueName: string;
    reportStatus: string;
  }>;
}

/**
 * Shows the status of league match reports in the match end overlay.
 * Polls for report status after a match ends.
 */
export function LeagueReportStatus({ matchId }: LeagueReportStatusProps) {
  const [reports, setReports] = useState<LeagueReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let retryCount = 0;
    const maxRetries = 5;

    async function fetchReports() {
      try {
        const res = await fetch(`/api/leagues/reports?matchId=${matchId}`);
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data = (await res.json()) as ReportResponse;
        if (cancelled) return;

        if (data.reports.length > 0) {
          setReports(
            data.reports.map((r) => ({
              leagueName: r.leagueName,
              leagueSlug: r.leagueSlug,
              status: r.reportStatus as "pending" | "sent" | "failed",
            })),
          );
          setLoading(false);
        } else if (retryCount < maxRetries) {
          // Reports may not be created yet (fire-and-forget on server)
          retryCount++;
          setTimeout(fetchReports, 2000);
        } else {
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    // Wait a moment for server to process the report
    const timer = setTimeout(fetchReports, 1500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [matchId]);

  if (loading && reports.length === 0) return null;
  if (reports.length === 0) return null;

  return (
    <div className="bg-violet-900/20 border border-violet-700/40 rounded-lg p-3 text-sm">
      <div className="text-xs text-violet-300/70 mb-2 font-medium">
        League Reports
      </div>
      <div className="space-y-1.5">
        {reports.map((report) => (
          <div
            key={report.leagueSlug}
            className="flex items-center justify-between gap-2"
          >
            <span className="flex items-center gap-1.5 text-stone-200">
              <span>
                {LEAGUE_EMOJIS[report.leagueSlug] || "\uD83C\uDFC6"}
              </span>
              {report.leagueName}
            </span>
            <span className="flex items-center gap-1">
              {report.status === "sent" && (
                <>
                  <Check className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-xs text-green-400">Reported</span>
                </>
              )}
              {report.status === "pending" && (
                <>
                  <Loader2 className="w-3.5 h-3.5 text-yellow-400 animate-spin" />
                  <span className="text-xs text-yellow-400">Sending...</span>
                </>
              )}
              {report.status === "failed" && (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-xs text-red-400">Failed</span>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
