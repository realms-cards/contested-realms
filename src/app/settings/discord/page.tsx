"use client";

import {
  ArrowLeft,
  Check,
  AlertCircle,
  Loader2,
  RefreshCw,
  Unlink,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, Suspense } from "react";

interface LeagueEntry {
  id: string;
  slug: string;
  name: string;
  badgeColor: string | null;
  iconUrl: string | null;
  joinedAt: string;
}

interface AvailableLeague {
  id: string;
  slug: string;
  name: string;
  badgeColor: string | null;
  iconUrl: string | null;
}

interface DiscordStatus {
  discordId: string | null;
  discordUsername: string | null;
  leagues: LeagueEntry[];
}

const LEAGUE_EMOJIS: Record<string, string> = {
  "sorcerers-summit": "\u26F0\uFE0F",
};

function DiscordSettingsContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [availableLeagues, setAvailableLeagues] = useState<AvailableLeague[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch all available/supported leagues
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/leagues");
        if (res.ok) {
          const data = (await res.json()) as { leagues: AvailableLeague[] };
          setAvailableLeagues(data.leagues);
        }
      } catch {
        // Non-fatal
      }
    })();
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/users/me/discord");
      if (res.ok) {
        const data = (await res.json()) as DiscordStatus;
        setStatus(data);
      }
    } catch {
      setError("Failed to load Discord status");
    } finally {
      setLoading(false);
    }
  }, []);

  // Sync league memberships via bot token check
  const syncLeagues = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/users/me/discord/sync", { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as { leagues: LeagueEntry[] };
        setStatus((prev) =>
          prev ? { ...prev, leagues: data.leagues } : prev,
        );
        return data.leagues;
      }
    } catch {
      // Non-fatal — silently fail
    } finally {
      setSyncing(false);
    }
    return [];
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-sync leagues when Discord is linked but no leagues found
  useEffect(() => {
    if (status?.discordId && status.leagues.length === 0 && !syncing) {
      syncLeagues();
    }
  }, [status?.discordId, status?.leagues.length, syncing, syncLeagues]);

  // Handle OAuth callback results from URL params
  useEffect(() => {
    if (!searchParams) return;
    const success = searchParams.get("success");
    const errorParam = searchParams.get("error");

    if (success === "true") {
      setSuccessMessage("Discord linked successfully!");
      // Re-fetch status to show updated info
      fetchStatus();
      // Clear the URL params
      window.history.replaceState({}, "", "/settings/discord");
    } else if (errorParam) {
      const errorMessages: Record<string, string> = {
        oauth_denied: "Discord authorization was denied.",
        missing_params: "Missing OAuth parameters. Please try again.",
        invalid_state: "Invalid security token. Please try again.",
        not_authenticated: "Please sign in first.",
        not_configured: "Discord OAuth is not configured on the server.",
        token_exchange: "Failed to exchange authorization code.",
        user_fetch: "Failed to fetch Discord user info.",
        already_linked_other:
          "This Discord account is already linked to another user.",
        already_linked_self:
          "Your account already has a different Discord linked. Please unlink first.",
        internal: "An internal error occurred. Please try again.",
      };
      setError(errorMessages[errorParam] || `Unknown error: ${errorParam}`);
      window.history.replaceState({}, "", "/settings/discord");
    }
  }, [searchParams, fetchStatus]);

  const handleLink = async () => {
    setLinking(true);
    setError(null);
    try {
      const res = await fetch("/api/discord/oauth");
      if (!res.ok) {
        setError("Failed to start Discord linking");
        return;
      }
      const data = (await res.json()) as { url: string };
      // Redirect to Discord OAuth
      window.location.href = data.url;
    } catch {
      setError("Failed to start Discord linking");
      setLinking(false);
    }
  };

  const handleUnlink = async () => {
    if (
      !confirm(
        "Are you sure you want to unlink your Discord account? This will also remove all league memberships.",
      )
    ) {
      return;
    }

    setUnlinking(true);
    setError(null);
    try {
      const res = await fetch("/api/users/me/discord", { method: "DELETE" });
      if (res.ok) {
        setStatus({
          discordId: null,
          discordUsername: null,
          leagues: [],
        });
        setSuccessMessage("Discord unlinked successfully.");
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError("Failed to unlink Discord");
      }
    } catch {
      setError("Failed to unlink Discord");
    } finally {
      setUnlinking(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-stone-900 to-stone-950 text-stone-100 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="animate-pulse">Loading Discord settings...</div>
        </div>
      </div>
    );
  }

  const isLinked = !!status?.discordId;

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-900 to-stone-950 text-stone-100 p-6">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-violet-400 hover:text-violet-300 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <svg
            className="w-8 h-8 text-[#5865F2]"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z" />
          </svg>
          <h1 className="text-2xl font-bold">Discord & Leagues</h1>
        </div>

        <p className="text-stone-400 mb-8">
          Link your Discord account to automatically join leagues and report
          match results to communities you&apos;re part of.
        </p>

        {/* Success / Error messages */}
        {successMessage && (
          <div className="mb-6 bg-green-900/30 border border-green-700 rounded-lg p-4 flex items-center gap-2">
            <Check className="w-5 h-5 text-green-400" />
            <p className="text-green-300">{successMessage}</p>
          </div>
        )}
        {error && (
          <div className="mb-6 bg-red-900/30 border border-red-700 rounded-lg p-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <p className="text-red-300">{error}</p>
          </div>
        )}

        <div className="space-y-6">
          {/* Discord Link Status */}
          <div className="bg-stone-800/50 rounded-lg p-6 border border-stone-700">
            <h2 className="text-lg font-semibold mb-4">Discord Account</h2>

            {isLinked ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#5865F2] flex items-center justify-center text-white font-bold">
                    {status.discordUsername?.[0]?.toUpperCase() || "D"}
                  </div>
                  <div>
                    <p className="font-medium text-stone-100">
                      {status.discordUsername}
                    </p>
                    <p className="text-xs text-stone-500">
                      ID: {status.discordId}
                    </p>
                  </div>
                  <span className="ml-auto px-2.5 py-1 text-xs font-medium bg-green-900/30 text-green-400 rounded-full border border-green-700/50">
                    Connected
                  </span>
                </div>

                <button
                  onClick={handleUnlink}
                  disabled={unlinking}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:text-red-300
                             bg-red-900/20 hover:bg-red-900/30 border border-red-800/50
                             rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {unlinking ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Unlink className="w-4 h-4" />
                  )}
                  Unlink Discord
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-stone-400 text-sm">
                  Connect your Discord account to automatically detect league
                  memberships and enable match reporting.
                </p>
                <button
                  onClick={handleLink}
                  disabled={linking}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#5865F2] hover:bg-[#4752C4]
                             rounded-lg font-medium transition-colors
                             disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {linking ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <svg
                      className="w-5 h-5"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z" />
                    </svg>
                  )}
                  Link Discord Account
                </button>
                <p className="text-xs text-stone-500">
                  You can also link via our Discord bot using the{" "}
                  <code className="text-stone-400">/link</code> command.
                </p>
              </div>
            )}
          </div>

          {/* Supported Leagues */}
          {isLinked && (
            <div className="bg-stone-800/50 rounded-lg p-6 border border-stone-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Supported Leagues</h2>
                <button
                  onClick={syncLeagues}
                  disabled={syncing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-stone-300 hover:text-stone-100
                             bg-stone-700/50 hover:bg-stone-700 border border-stone-600
                             rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {syncing ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  {syncing ? "Syncing..." : "Refresh"}
                </button>
              </div>
              {syncing && status.leagues.length === 0 && availableLeagues.length === 0 ? (
                <div className="flex items-center gap-2 text-stone-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Checking Discord servers...
                </div>
              ) : (
                <div className="space-y-3">
                  {(availableLeagues.length > 0 ? availableLeagues : status.leagues).map((league) => {
                    const memberLeagueIds = new Set(status.leagues.map((l) => l.id));
                    const isMember = memberLeagueIds.has(league.id);
                    const memberEntry = status.leagues.find((l) => l.id === league.id);
                    const color = league.badgeColor || "#7c3aed";

                    return (
                      <div
                        key={league.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border ${
                          isMember ? "" : "opacity-60"
                        }`}
                        style={{
                          borderColor: isMember ? `${color}40` : undefined,
                          backgroundColor: isMember ? `${color}10` : undefined,
                        }}
                      >
                        <span className="text-xl">
                          {LEAGUE_EMOJIS[league.slug] || "\uD83C\uDFC6"}
                        </span>
                        <div className="flex-1">
                          <p className="font-medium text-stone-100">
                            {league.name}
                          </p>
                          {isMember && memberEntry ? (
                            <p className="text-xs text-stone-500">
                              Joined{" "}
                              {new Date(memberEntry.joinedAt).toLocaleDateString()}
                            </p>
                          ) : (
                            <p className="text-xs text-stone-500">
                              Join their Discord server to participate
                            </p>
                          )}
                        </div>
                        {isMember ? (
                          <span className="px-2.5 py-1 text-xs font-medium bg-green-900/30 text-green-400 rounded-full border border-green-700/50">
                            Member
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 text-xs font-medium bg-stone-700/50 text-stone-400 rounded-full border border-stone-600/50">
                            Not joined
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {availableLeagues.length === 0 && status.leagues.length === 0 && (
                    <p className="text-stone-500 text-sm">
                      No supported leagues found. Join a supported Discord server
                      and click Refresh.
                    </p>
                  )}
                </div>
              )}

              <p className="mt-4 text-xs text-stone-500">
                League memberships are detected based on your Discord server
                memberships. Matches against other league members are reported
                automatically.
              </p>
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="mt-12 p-6 bg-stone-800/30 rounded-lg border border-stone-700">
          <h2 className="text-lg font-semibold mb-4">How it works</h2>
          <ol className="space-y-3 text-stone-400 text-sm">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-bold">
                1
              </span>
              <span>
                Link your Discord account using the button above or via our
                Discord bot.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-bold">
                2
              </span>
              <span>
                Your Discord server memberships are checked against supported
                leagues. Matching leagues appear automatically.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-bold">
                3
              </span>
              <span>
                When you play a match against another member of the same league,
                the result is automatically reported to that league.
              </span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}

export default function DiscordSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-stone-900 to-stone-950 text-stone-100 p-6">
          <div className="max-w-2xl mx-auto">
            <div className="animate-pulse">Loading Discord settings...</div>
          </div>
        </div>
      }
    >
      <DiscordSettingsContent />
    </Suspense>
  );
}
