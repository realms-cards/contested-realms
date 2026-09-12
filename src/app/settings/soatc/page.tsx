"use client";

import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { useState, useEffect } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { PageHeader, PanelHeader } from "@/components/ui/page-header";
import { RcButton, RcLinkButton } from "@/components/ui/rc-button";
import { useSoatcSettings } from "@/lib/hooks/useSoatcStatus";

interface MatchHistoryEntry {
  id: string;
  matchId: string;
  tournamentId: string;
  tournamentName: string;
  opponent: {
    id: string;
    name: string | null;
    image: string | null;
  };
  result: "win" | "loss" | "draw";
  format: string;
  completedAt: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RESULT_TONE: Record<MatchHistoryEntry["result"], BadgeTone> = {
  win: "ok",
  loss: "danger",
  draw: "default",
};

const HOW_IT_WORKS = [
  "Enter your SATC UUID from your ranking profile above.",
  "When you play against another SATC participant, the match can be flagged as a league match.",
  "After the match, you'll get a result JSON to submit to the SATC ranking system.",
];

export default function SoatcSettingsPage() {
  const { soatcUuid, soatcAutoDetect, loading, saving, error, updateSettings } =
    useSoatcSettings();

  const [uuidInput, setUuidInput] = useState("");
  const [autoDetect, setAutoDetect] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Match history state
  const [matchHistory, setMatchHistory] = useState<MatchHistoryEntry[]>([]);
  const [matchHistoryLoading, setMatchHistoryLoading] = useState(false);
  const [matchHistoryExpanded, setMatchHistoryExpanded] = useState(false);

  useEffect(() => {
    setUuidInput(soatcUuid || "");
    setAutoDetect(soatcAutoDetect);
  }, [soatcUuid, soatcAutoDetect]);

  // Fetch match history when UUID is set
  useEffect(() => {
    if (!soatcUuid) {
      setMatchHistory([]);
      return;
    }

    const fetchHistory = async () => {
      setMatchHistoryLoading(true);
      try {
        const res = await fetch("/api/soatc/matches?limit=20");
        if (res.ok) {
          const data = await res.json();
          setMatchHistory(data.matches || []);
        }
      } catch (err) {
        console.error("Failed to fetch match history:", err);
      } finally {
        setMatchHistoryLoading(false);
      }
    };

    fetchHistory();
  }, [soatcUuid]);

  const validateUuid = (uuid: string): boolean => {
    if (!uuid) return true; // Empty is valid (clearing)
    return UUID_REGEX.test(uuid);
  };

  const handleSave = async () => {
    setSaveSuccess(false);
    setValidationError(null);

    if (uuidInput && !validateUuid(uuidInput)) {
      setValidationError(
        "Invalid UUID format. Expected format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      );
      return;
    }

    const success = await updateSettings({
      soatcUuid: uuidInput || null,
      soatcAutoDetect: autoDetect,
    });

    if (success) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  const header = (
    <PageHeader
      eyebrow="settings"
      title="Sorcerers at the Core"
      description={
        <>
          Connect your Realms.cards account with the{" "}
          <a
            href="https://ranking.sorcerersatthecore.com"
            target="_blank"
            rel="noopener noreferrer"
            className="rc-link inline-flex items-center gap-1"
          >
            SATC Ranking System
            <ExternalLink className="h-3 w-3" />
          </a>{" "}
          to participate in monthly tournaments.
        </>
      }
      actions={soatcUuid ? <Badge tone="ok">account linked</Badge> : null}
    />
  );

  if (loading) {
    return (
      <div className="space-y-6">
        {header}
        <div className="rc-hint py-6 text-center">
          loading SATC settings...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <section className="rc-panel">
        <PanelHeader title="League account" />
        <div className="space-y-5 px-[18px] py-4">
          {/* UUID Input */}
          <div>
            <label htmlFor="soatc-uuid" className="rc-eyebrow block">
              Your SATC UUID
            </label>
            <p className="mt-1.5 font-rc-sans text-xs leading-relaxed text-rc-fg-muted">
              Find your UUID by scrolling down to the bottom of this page when
              logged in:{" "}
              <a
                href="https://ranking.sorcerersatthecore.com"
                target="_blank"
                rel="noopener noreferrer"
                className="rc-link"
              >
                ranking.sorcerersatthecore.com
              </a>
            </p>
            <input
              id="soatc-uuid"
              type="text"
              value={uuidInput}
              onChange={(e) => {
                setUuidInput(e.target.value);
                setValidationError(null);
              }}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="rc-input mt-3 h-10 w-full max-w-xl"
            />
            {validationError && (
              <div className="rc-alert mt-2" data-tone="danger">
                {validationError}
              </div>
            )}
          </div>

          {/* Auto-detect Toggle */}
          <div className="rounded-rc-md border border-rc-line/12 bg-black/30 p-4">
            <label className="rc-check items-start">
              <input
                id="auto-detect"
                type="checkbox"
                checked={autoDetect}
                onChange={(e) => setAutoDetect(e.target.checked)}
                disabled={!uuidInput}
                className="mt-0.5 h-4 w-4 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="min-w-0">
                <span
                  className={
                    uuidInput
                      ? "block text-rc-fg-strong"
                      : "block text-rc-fg-dim"
                  }
                >
                  Auto-detect SATC tournament matches
                </span>
                <span className="mt-1 block font-rc-sans text-xs normal-case leading-relaxed tracking-normal text-rc-fg-muted">
                  When enabled, matches against other tournament participants
                  will automatically be flagged as league matches.
                </span>
              </span>
            </label>
          </div>

          {/* Error Display */}
          {error && (
            <div className="rc-alert" data-tone="danger">
              {error}
            </div>
          )}

          {/* Save Button */}
          <div className="flex flex-wrap items-center gap-3">
            <RcButton onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save settings"}
            </RcButton>
            {saveSuccess && <Badge tone="ok">saved</Badge>}
          </div>
        </div>
      </section>

      {/* Match History Section */}
      {soatcUuid && (
        <section className="rc-panel">
          <PanelHeader
            title="Match history"
            meta={`${matchHistory.length} matches`}
          >
            <RcButton
              variant="ghost"
              size="sm"
              onClick={() => setMatchHistoryExpanded(!matchHistoryExpanded)}
              aria-expanded={matchHistoryExpanded}
            >
              {matchHistoryExpanded ? "Hide" : "Show"}
              {matchHistoryExpanded ? (
                <ChevronUp className="h-4 w-4 text-rc-fg-muted" />
              ) : (
                <ChevronDown className="h-4 w-4 text-rc-fg-muted" />
              )}
            </RcButton>
          </PanelHeader>

          {matchHistoryExpanded && (
            <div className="px-[18px] py-3.5">
              {matchHistoryLoading ? (
                <div className="rc-hint py-6 text-center">
                  loading match history...
                </div>
              ) : matchHistory.length === 0 ? (
                <div className="rc-hint py-6 text-center">
                  no tournament matches recorded yet — play a league match and
                  it will appear here
                </div>
              ) : (
                <div className="divide-y divide-rc-line/8">
                  {matchHistory.map((match) => (
                    <div
                      key={match.id}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={RESULT_TONE[match.result]}>
                            {match.result}
                          </Badge>
                          <span className="truncate font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                            vs {match.opponent.name || "Unknown"}
                          </span>
                        </div>
                        <div className="rc-hint mt-1 flex flex-wrap items-center gap-2">
                          <span>{match.tournamentName}</span>
                          <span>·</span>
                          <span className="capitalize">{match.format}</span>
                          <span>·</span>
                          <span>
                            {new Date(match.completedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <RcLinkButton
                        href={`/replay/${match.matchId}`}
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                      >
                        Replay
                      </RcLinkButton>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Info Section */}
      <section className="rc-panel">
        <PanelHeader title="How it works" />
        <ol className="space-y-3 px-[18px] py-4">
          {HOW_IT_WORKS.map((step, index) => (
            <li
              key={step}
              className="flex gap-3 font-rc-sans text-sm leading-relaxed text-rc-fg-muted"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-rc-accent/35 bg-rc-accent/16 font-rc-mono text-[11px] text-rc-accent-link">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
