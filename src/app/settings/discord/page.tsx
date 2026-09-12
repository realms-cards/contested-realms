"use client";

import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PanelHeader } from "@/components/ui/page-header";
import { RcButton } from "@/components/ui/rc-button";

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

interface SyncResponse {
  synced: boolean;
  leagues: LeagueEntry[];
  hint?: string;
}

interface DiscordStatus {
  discordId: string | null;
  discordUsername: string | null;
  leagues: LeagueEntry[];
}

const HOW_IT_WORKS = [
  "Link your Discord account using the button above or via our Discord bot.",
  "Your Discord server memberships are checked against supported leagues. Matching leagues appear automatically.",
  "When you play a match against another member of the same league, the result is automatically reported to that league.",
];

/** Discord brand mark used on the OAuth button. */
function DiscordMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z" />
    </svg>
  );
}

function DiscordSettingsContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncAttempted, setSyncAttempted] = useState(false);
  const [needsRelink, setNeedsRelink] = useState(false);
  const [availableLeagues, setAvailableLeagues] = useState<AvailableLeague[]>(
    [],
  );
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

  // Sync league memberships using stored guild IDs from OAuth
  const syncLeagues = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/users/me/discord/sync", { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as SyncResponse;
        setStatus((prev) =>
          prev ? { ...prev, leagues: data.leagues } : prev,
        );
        if (data.hint) {
          setNeedsRelink(true);
        }
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

  // Auto-sync leagues once when Discord is linked but no leagues found
  useEffect(() => {
    if (
      status?.discordId &&
      status.leagues.length === 0 &&
      !syncing &&
      !syncAttempted
    ) {
      setSyncAttempted(true);
      syncLeagues();
    }
  }, [
    status?.discordId,
    status?.leagues.length,
    syncing,
    syncAttempted,
    syncLeagues,
  ]);

  // Handle OAuth callback results from URL params
  useEffect(() => {
    if (!searchParams) return;
    const success = searchParams.get("success");
    const errorParam = searchParams.get("error");

    if (success === "true") {
      setSuccessMessage("Discord linked successfully!");
      setNeedsRelink(false);
      setSyncAttempted(false);
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
      <div className="space-y-6">
        <DiscordPageHeader />
        <div className="rc-hint py-6 text-center">
          loading Discord settings...
        </div>
      </div>
    );
  }

  const isLinked = !!status?.discordId;

  return (
    <div className="space-y-6">
      <DiscordPageHeader
        badge={isLinked ? <Badge tone="ok">connected</Badge> : null}
      />

      {/* Success / Error messages */}
      {successMessage && (
        <div className="rc-alert" data-tone="success">
          {successMessage}
        </div>
      )}
      {error && (
        <div className="rc-alert" data-tone="danger">
          {error}
        </div>
      )}

      {/* Discord Link Status */}
      <section className="rc-panel">
        <PanelHeader title="Discord account" />
        <div className="px-[18px] py-4">
          {isLinked ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-rc-accent/35 bg-rc-accent/16 font-rc-display text-lg text-rc-accent-link">
                  {status.discordUsername?.[0]?.toUpperCase() || "D"}
                </div>
                <div className="min-w-0">
                  <p className="m-0 font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                    {status.discordUsername}
                  </p>
                  <p className="rc-hint m-0 mt-1 truncate">
                    id {status.discordId}
                  </p>
                </div>
                <Badge tone="ok" className="ml-auto">
                  connected
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {needsRelink && (
                  <RcButton
                    variant="outline"
                    onClick={handleLink}
                    disabled={linking}
                  >
                    {linking && (
                      <Loader2 className="h-4 w-4 animate-spin text-rc-fg-muted" />
                    )}
                    Re-link to detect servers
                  </RcButton>
                )}
                <RcButton
                  variant="destructive"
                  onClick={handleUnlink}
                  disabled={unlinking}
                >
                  {unlinking && <Loader2 className="h-4 w-4 animate-spin" />}
                  Unlink Discord
                </RcButton>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="m-0 max-w-[68ch] font-rc-sans text-sm leading-relaxed text-rc-fg-muted">
                Connect your Discord account to automatically detect league
                memberships and enable match reporting.
              </p>
              <RcButton onClick={handleLink} disabled={linking}>
                {linking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <DiscordMark className="h-4 w-4" />
                )}
                Link Discord account
              </RcButton>
              <p className="rc-hint m-0">
                you can also link via our Discord bot using the{" "}
                <code className="text-rc-fg-muted">/link</code> command
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Supported Leagues */}
      {isLinked && (
        <section className="rc-panel">
          <PanelHeader title="Supported leagues">
            <RcButton
              variant="outline"
              size="sm"
              onClick={syncLeagues}
              disabled={syncing}
            >
              {syncing && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-rc-fg-muted" />
              )}
              {syncing ? "Syncing..." : "Refresh"}
            </RcButton>
          </PanelHeader>
          <div className="px-[18px] py-4">
            {syncing &&
            status.leagues.length === 0 &&
            availableLeagues.length === 0 ? (
              <div className="rc-hint py-6 text-center">
                checking Discord servers...
              </div>
            ) : (
              <div className="space-y-3">
                {(availableLeagues.length > 0
                  ? availableLeagues
                  : status.leagues
                ).map((league) => {
                  const memberLeagueIds = new Set(
                    status.leagues.map((l) => l.id),
                  );
                  const isMember = memberLeagueIds.has(league.id);
                  const memberEntry = status.leagues.find(
                    (l) => l.id === league.id,
                  );

                  return (
                    <div
                      key={league.id}
                      className={`flex flex-wrap items-center gap-3 rounded-rc-md border p-3 ${
                        isMember
                          ? "border-rc-accent/30 bg-rc-accent/8"
                          : "border-rc-line/12 bg-black/30 opacity-70"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="m-0 font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                          {league.name}
                        </p>
                        {isMember && memberEntry ? (
                          <p className="rc-hint m-0 mt-1">
                            joined{" "}
                            {new Date(
                              memberEntry.joinedAt,
                            ).toLocaleDateString()}
                          </p>
                        ) : (
                          <p className="rc-hint m-0 mt-1">
                            join their Discord server to participate
                          </p>
                        )}
                      </div>
                      {isMember ? (
                        <Badge tone="ok">member</Badge>
                      ) : (
                        <Badge>not joined</Badge>
                      )}
                    </div>
                  );
                })}
                {availableLeagues.length === 0 &&
                  status.leagues.length === 0 && (
                    <p className="rc-hint m-0">
                      no supported leagues found — join a supported Discord
                      server and click Refresh
                    </p>
                  )}
              </div>
            )}

            {needsRelink && (
              <div className="rc-alert mt-4" data-tone="warning">
                Your Discord was linked via the bot command. Click &quot;Re-link
                to detect servers&quot; above to detect your Discord server
                memberships and enable league features.
              </div>
            )}
            <p className="mt-4 max-w-[68ch] font-rc-sans text-xs leading-relaxed text-rc-fg-muted">
              League memberships are detected based on your Discord server
              memberships. Matches against other league members are reported
              automatically.
            </p>
          </div>
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

function DiscordPageHeader({ badge }: { badge?: React.ReactNode }) {
  return (
    <PageHeader
      eyebrow="settings"
      title="Discord & Leagues"
      description="Link your Discord account to automatically join leagues and report match results to communities you're part of."
      actions={badge}
    />
  );
}

export default function DiscordSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <DiscordPageHeader />
          <div className="rc-hint py-6 text-center">
            loading Discord settings...
          </div>
        </div>
      }
    >
      <DiscordSettingsContent />
    </Suspense>
  );
}
