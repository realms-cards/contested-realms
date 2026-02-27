"use client";

import {
  ExternalLink,
  Check,
  AlertCircle,
  Trophy,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
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
        "Invalid UUID format. Expected format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
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

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="animate-pulse">Loading SATC settings...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Trophy className="w-8 h-8 text-amber-400" />
          <h1 className="text-2xl font-bold">Sorcerers at the Core</h1>
        </div>

        <p className="text-stone-400 mb-8">
          Connect your Realms.cards account with the{" "}
          <a
            href="https://ranking.sorcerersatthecore.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 hover:text-amber-300 inline-flex items-center gap-1"
          >
            SATC Ranking System
            <ExternalLink className="w-3 h-3" />
          </a>{" "}
          to participate in monthly tournaments.
        </p>

        <div className="space-y-6">
          {/* UUID Input */}
          <div className="bg-stone-800/50 rounded-lg p-6 border border-stone-700">
            <label
              htmlFor="soatc-uuid"
              className="block text-sm font-medium text-stone-300 mb-2"
            >
              Your SATC UUID
            </label>
            <p className="text-xs text-stone-500 mb-3">
              Find your UUID by scrolling down to the bottom of this page when
              logged in:{" "}
              <a
                href="https://ranking.sorcerersatthecore.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 hover:text-amber-300"
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
              className="w-full px-4 py-2 bg-stone-900 border border-stone-600 rounded-lg 
                         text-stone-100 placeholder-stone-500
                         focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent
                         font-mono text-sm"
            />
            {validationError && (
              <p className="mt-2 text-sm text-red-400 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {validationError}
              </p>
            )}
          </div>

          {/* Auto-detect Toggle */}
          <div className="bg-stone-800/50 rounded-lg p-6 border border-stone-700">
            <div className="flex items-start gap-4">
              <input
                id="auto-detect"
                type="checkbox"
                checked={autoDetect}
                onChange={(e) => setAutoDetect(e.target.checked)}
                disabled={!uuidInput}
                className="mt-1 w-5 h-5 rounded border-stone-600 bg-stone-900 
                           text-amber-500 focus:ring-amber-500 focus:ring-offset-stone-800
                           disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <div>
                <label
                  htmlFor="auto-detect"
                  className={`block font-medium ${
                    uuidInput ? "text-stone-100" : "text-stone-500"
                  }`}
                >
                  Auto-detect SATC tournament matches
                </label>
                <p className="text-sm text-stone-500 mt-1">
                  When enabled, matches against other tournament participants
                  will automatically be flagged as league matches.
                </p>
              </div>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <p className="text-red-300">{error}</p>
            </div>
          )}

          {/* Save Button */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-stone-600 
                         rounded-lg font-medium transition-colors
                         disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
            {saveSuccess && (
              <span className="text-green-400 flex items-center gap-1">
                <Check className="w-4 h-4" />
                Saved!
              </span>
            )}
          </div>
        </div>

        {/* Match History Section */}
        {soatcUuid && (
          <div className="mt-8">
            <button
              onClick={() => setMatchHistoryExpanded(!matchHistoryExpanded)}
              className="w-full flex items-center justify-between p-4 bg-stone-800/50 rounded-lg border border-stone-700 hover:bg-stone-800/70 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" />
                <span className="font-medium">Match History</span>
                <span className="text-sm text-stone-500">
                  ({matchHistory.length} matches)
                </span>
              </div>
              {matchHistoryExpanded ? (
                <ChevronUp className="w-5 h-5 text-stone-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-stone-400" />
              )}
            </button>

            {matchHistoryExpanded && (
              <div className="mt-2 bg-stone-800/30 rounded-lg border border-stone-700 overflow-hidden">
                {matchHistoryLoading ? (
                  <div className="p-4 text-center text-stone-400">
                    Loading match history...
                  </div>
                ) : matchHistory.length === 0 ? (
                  <div className="p-4 text-center text-stone-500">
                    No tournament matches recorded yet. Play a league match and
                    it will appear here!
                  </div>
                ) : (
                  <div className="divide-y divide-stone-700">
                    {matchHistory.map((match) => (
                      <div
                        key={match.id}
                        className="p-4 flex items-center justify-between gap-4"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded ${
                                match.result === "win"
                                  ? "bg-green-900/50 text-green-400"
                                  : match.result === "loss"
                                  ? "bg-red-900/50 text-red-400"
                                  : "bg-stone-700 text-stone-300"
                              }`}
                            >
                              {match.result.toUpperCase()}
                            </span>
                            <span className="text-sm text-stone-300 truncate">
                              vs {match.opponent.name || "Unknown"}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-stone-500 flex items-center gap-2">
                            <span>{match.tournamentName}</span>
                            <span>•</span>
                            <span className="capitalize">{match.format}</span>
                            <span>•</span>
                            <span>
                              {new Date(match.completedAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <Link
                          href={`/replay/${match.matchId}`}
                          className="shrink-0 px-3 py-1.5 text-xs bg-stone-700 hover:bg-stone-600 rounded transition-colors"
                        >
                          Replay
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Info Section */}
        <div className="mt-12 p-6 bg-stone-800/30 rounded-lg border border-stone-700">
          <h2 className="text-lg font-semibold mb-4">How it works</h2>
          <ol className="space-y-3 text-stone-400 text-sm">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs font-bold">
                1
              </span>
              <span>Enter your SATC UUID from your ranking profile above.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs font-bold">
                2
              </span>
              <span>
                When you play against another SATC participant, the match can be
                flagged as a league match.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs font-bold">
                3
              </span>
              <span>
                After the match, you&apos;ll get a result JSON to submit to the
                SATC ranking system.
              </span>
            </li>
          </ol>
        </div>
    </div>
  );
}
