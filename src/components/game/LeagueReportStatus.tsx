"use client";

import { Icon } from "@iconify/react";
import { Check, Loader2, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";

const LEAGUE_ICONS: Record<string, string> = {
  "sorcerers-summit": "game-icons:mountains",
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
    <div className="rounded-rc-md border border-rc-line/12 bg-black/30 p-3 font-rc-sans text-sm">
      <div className="rc-eyebrow mb-2">
        League Reports
      </div>
      <div className="space-y-1.5">
        {reports.map((report) => (
          <div
            key={report.leagueSlug}
            className="flex items-center justify-between gap-2"
          >
            <span className="flex items-center gap-1.5 text-rc-fg">
              <Icon
                icon={LEAGUE_ICONS[report.leagueSlug] || "game-icons:laurels-trophy"}
                width={14}
                height={14}
                className="text-rc-accent-link"
                aria-hidden="true"
              />
              {report.leagueName}
            </span>
            <span className="flex items-center gap-1">
              {report.status === "sent" && (
                <>
                  <Check className="w-3.5 h-3.5 text-rc-success" />
                  <span className="font-rc-mono text-xs text-rc-success">Reported</span>
                </>
              )}
              {report.status === "pending" && (
                <>
                  <Loader2 className="w-3.5 h-3.5 text-rc-warning animate-spin" />
                  <span className="font-rc-mono text-xs text-rc-warning">Sending...</span>
                </>
              )}
              {report.status === "failed" && (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-rc-danger" />
                  <span className="font-rc-mono text-xs text-rc-danger">Failed</span>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
