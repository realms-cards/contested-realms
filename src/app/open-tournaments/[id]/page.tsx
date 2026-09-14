"use client";

import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import GuestGate from "@/components/auth/GuestGate";
import { OpenTournamentDeckSubmit } from "@/components/open-tournament/OpenTournamentDeckSubmit";
import { OpenTournamentMatchCard } from "@/components/open-tournament/OpenTournamentMatchCard";
import { OpenTournamentPairingPanel } from "@/components/open-tournament/OpenTournamentPairingPanel";
import { OpenTournamentPlayerManager } from "@/components/open-tournament/OpenTournamentPlayerManager";
import { OpenTournamentStandings } from "@/components/open-tournament/OpenTournamentStandings";
import TournamentInviteLinkButton from "@/components/tournament/TournamentInviteLinkButton";
import AppShell from "@/components/ui/AppShell";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PanelHeader } from "@/components/ui/page-header";
import { RcButton, RcLinkButton } from "@/components/ui/rc-button";
import { RcEmpty } from "@/components/ui/rc-empty";
import { useViewer } from "@/lib/guest/useViewer";
import type { OpenTournamentSettings } from "@/lib/open-tournament/types";
import { getTournamentInviteToken } from "@/lib/tournament/invite-links";

interface Player {
  id: string;
  name: string | null;
  image?: string | null;
}

interface Registration {
  playerId: string;
  seatStatus: string;
  preparationData: Record<string, unknown> | null;
  player: Player;
}

interface Standing {
  playerId: string;
  displayName: string;
  matchPoints: number;
  wins: number;
  losses: number;
  draws: number;
  gameWinPercentage: number;
  opponentMatchWinPercentage: number;
  isEliminated: boolean;
}

interface Match {
  id: string;
  roundId: string;
  status: string;
  players: Array<{ id: string; name: string }>;
  results: Record<string, unknown> | null;
  completedAt: string | null;
}

interface Round {
  id: string;
  roundNumber: number;
  status: string;
  matches: Match[];
}

interface Tournament {
  id: string;
  name: string;
  format: "open";
  status: string;
  maxPlayers: number;
  creatorId: string;
  createdAt: string;
  isPrivate: boolean;
  settings: Record<string, unknown>;
  registrations: Registration[];
  standings: Standing[];
  rounds: Round[];
}

const TABS = ["overview", "rounds", "standings"] as const;

/** Status square + label colour, mirroring the lobby games table. */
function statusTone(status: string): string {
  switch (status) {
    case "registering":
      return "text-rc-success";
    case "preparing":
      return "text-rc-warning";
    case "active":
    case "playing":
    case "cancelled":
      return "text-rc-danger";
    default:
      return "text-rc-fg-dim";
  }
}

export default function OpenTournamentDashboardPage() {
  const params = useParams();
  const id = params?.id as string;
  const viewer = useViewer();
  const searchParams = useSearchParams();
  const inviteToken = getTournamentInviteToken(searchParams);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const pathnameForReturn = usePathname();
  const currentHref = `${pathnameForReturn ?? "/"}${
    searchParams?.toString() ? `?${searchParams.toString()}` : ""
  }`;
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "overview" | "rounds" | "standings"
  >("overview");

  const fetchTournament = useCallback(async () => {
    try {
      const res = await fetch(
        inviteToken
          ? `/api/open-tournaments/${id}?invite=${encodeURIComponent(inviteToken)}`
          : `/api/open-tournaments/${id}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch");
      setTournament(data.tournament);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [id, inviteToken]);

  useEffect(() => {
    if (viewer.id) {
      fetchTournament();
    }
  }, [viewer.id, fetchTournament]);

  if (viewer.status === "loading" || (loading && !viewer.isAnonymous)) {
    return (
      <AppShell>
        <div className="rc-hint py-6 text-center">loading…</div>
      </AppShell>
    );
  }

  if (viewer.isAnonymous) {
    return (
      <AppShell width="narrow">
        <GuestGate
          variant="realms"
          title={"You’ve been invited to a tournament"}
          description="Sign in, or continue as a guest to take part."
          returnTo={currentHref}
        />
      </AppShell>
    );
  }

  if (error || !tournament) {
    return (
      <AppShell>
        <div className="rc-alert" data-tone="danger">
          {error ?? "Tournament not found"}
        </div>
      </AppShell>
    );
  }

  const isHost = viewer.id === tournament.creatorId;
  const settings = tournament.settings as unknown as OpenTournamentSettings;
  const activeRound = tournament.rounds.find((r) => r.status === "active");
  const completedRounds = tournament.rounds.filter(
    (r) => r.status === "completed",
  );
  const activePlayerCount = tournament.registrations.filter(
    (r) => r.seatStatus === "active",
  ).length;

  const handleEndEvent = async () => {
    if (!confirm("End this event? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/open-tournaments/${id}`, { method: "PUT" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to end event");
      fetchTournament();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to end event");
    }
  };

  const handleJoin = async () => {
    setJoining(true);
    setJoinError(null);
    try {
      const res = await fetch(`/api/open-tournaments/${tournament.id}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inviteToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not join");
      await fetchTournament();
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : "Could not join");
    } finally {
      setJoining(false);
    }
  };

  const canSelfRegister = Boolean(
    !isHost &&
    inviteToken &&
    tournament.status === "active" &&
    viewer.id &&
    !tournament.registrations.some(
      (r) => r.playerId === viewer.id && r.seatStatus === "active",
    ),
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow={
          <Link href="/open-tournaments" className="rc-link">
            Open Events
          </Link>
        }
        title={tournament.name}
        actions={
          <>
            {/* Play Network Link */}
            {settings.playNetworkUrl && (
              <RcLinkButton
                variant="outline"
                href={settings.playNetworkUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Play Network Event
              </RcLinkButton>
            )}

            {isHost && tournament.status === "active" && (
              <TournamentInviteLinkButton
                tournamentId={tournament.id}
                kind="open"
                inviteToken={
                  (tournament as { inviteToken?: string | null }).inviteToken ??
                  null
                }
              />
            )}
            {/* Invite link visitor who is not seated yet: self-register */}
            {canSelfRegister && (
              <RcButton
                onClick={handleJoin}
                disabled={joining}
                title={joinError ?? undefined}
              >
                {joining
                  ? "Joining…"
                  : joinError
                    ? "Join failed - retry"
                    : "Join tournament"}
              </RcButton>
            )}
            {/* End Event Button (host only) */}
            {isHost && tournament.status === "active" && (
              <RcButton variant="danger-soft" onClick={handleEndEvent}>
                End Event
              </RcButton>
            )}
          </>
        }
      />

      {/* Meta row */}
      <div className="-mt-3 flex flex-wrap items-center gap-3">
        <span
          className={`flex items-center gap-2 font-rc-mono text-[11px] uppercase tracking-[0.14em] ${statusTone(
            tournament.status,
          )}`}
        >
          <span className="rc-dot" />
          {tournament.status}
        </span>
        {settings.gameFormat && <Badge>{settings.gameFormat}</Badge>}
        <span className="rc-hint">{activePlayerCount} players</span>
        {completedRounds.length > 0 && (
          <span className="rc-hint">
            Round {completedRounds.length}
            {activeRound
              ? ` (Round ${activeRound.roundNumber} active)`
              : " completed"}
          </span>
        )}
      </div>

      {/* Tabs */}
      <nav className="rc-tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className="rc-tab"
            data-active={activeTab === tab}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: Players */}
          <div className="lg:col-span-2">
            <OpenTournamentPlayerManager
              tournamentId={tournament.id}
              tournamentName={tournament.name}
              registrations={tournament.registrations}
              standings={tournament.standings}
              isHost={isHost}
              isActive={tournament.status === "active"}
              onRefresh={fetchTournament}
            />
          </div>

          {/* Right: Settings & Deck */}
          <div className="space-y-6">
            {/* Settings Summary */}
            <section className="rc-panel">
              <PanelHeader title="Settings" />
              <div className="space-y-2 px-[18px] py-3.5 font-rc-mono text-xs tracking-[0.1em]">
                <div className="flex justify-between gap-3">
                  <span className="text-rc-fg-subtle">Pairing</span>
                  <span className="text-rc-fg-strong">
                    {settings.pairing?.source ?? "swiss"}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-rc-fg-subtle">Play on Realms</span>
                  <span className="text-rc-fg-strong">
                    {settings.matchResolution?.allowRealms ? "Yes" : "No"}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-rc-fg-subtle">Manual reporting</span>
                  <span className="text-rc-fg-strong">
                    {settings.matchResolution?.allowManualReport ? "Yes" : "No"}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-rc-fg-subtle">Host approval</span>
                  <span className="text-rc-fg-strong">
                    {settings.matchResolution?.requireHostApproval
                      ? "Required"
                      : "No"}
                  </span>
                </div>
              </div>
            </section>

            {/* Deck Submit (for current user if registered) */}
            {viewer.id &&
              tournament.registrations.some(
                (r) => r.playerId === viewer.id && r.seatStatus === "active",
              ) && (
                <OpenTournamentDeckSubmit
                  tournamentId={tournament.id}
                  playerId={viewer.id}
                  currentDeckData={
                    (tournament.registrations.find(
                      (r) => r.playerId === viewer.id,
                    )?.preparationData?.open ?? {}) as Record<string, unknown>
                  }
                  onRefresh={fetchTournament}
                />
              )}
          </div>
        </div>
      )}

      {activeTab === "rounds" && (
        <div className="space-y-6">
          {/* Pairing Panel (host only) */}
          {isHost && tournament.status === "active" && (
            <OpenTournamentPairingPanel
              tournamentId={tournament.id}
              activeRound={activeRound ?? null}
              standings={tournament.standings}
              registrations={tournament.registrations}
              onRefresh={fetchTournament}
            />
          )}

          {/* Active Round Matches */}
          {activeRound && (
            <div>
              <h3 className="m-0 mb-3 flex items-center gap-2.5 font-rc-display text-[26px] leading-none text-rc-fg-strong">
                Round {activeRound.roundNumber}
                <Badge tone="ok">active</Badge>
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {activeRound.matches.map((match) => (
                  <OpenTournamentMatchCard
                    key={match.id}
                    tournamentId={tournament.id}
                    match={match}
                    isHost={isHost}
                    settings={settings}
                    onRefresh={fetchTournament}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed Rounds */}
          {completedRounds.map((round) => (
            <div key={round.id}>
              <h3 className="m-0 mb-3 flex items-center gap-2.5 font-rc-display text-[26px] leading-none text-rc-fg-strong">
                Round {round.roundNumber}
                <Badge>completed</Badge>
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {round.matches.map((match) => (
                  <OpenTournamentMatchCard
                    key={match.id}
                    tournamentId={tournament.id}
                    match={match}
                    isHost={isHost}
                    settings={settings}
                    onRefresh={fetchTournament}
                  />
                ))}
              </div>
            </div>
          ))}

          {tournament.rounds.length === 0 && (
            <RcEmpty title="No rounds yet.">
              {isHost
                ? "create a round and generate pairings to start"
                : "waiting for the host to start a round"}
            </RcEmpty>
          )}
        </div>
      )}

      {activeTab === "standings" && (
        <OpenTournamentStandings standings={tournament.standings} />
      )}
    </AppShell>
  );
}
