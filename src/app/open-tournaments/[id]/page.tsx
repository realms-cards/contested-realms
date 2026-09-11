"use client";

import Link from "next/link";
import {useParams, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import GuestGate from "@/components/auth/GuestGate";
import { OpenTournamentDeckSubmit } from "@/components/open-tournament/OpenTournamentDeckSubmit";
import { OpenTournamentMatchCard } from "@/components/open-tournament/OpenTournamentMatchCard";
import { OpenTournamentPairingPanel } from "@/components/open-tournament/OpenTournamentPairingPanel";
import { OpenTournamentPlayerManager } from "@/components/open-tournament/OpenTournamentPlayerManager";
import { OpenTournamentStandings } from "@/components/open-tournament/OpenTournamentStandings";
import TournamentInviteLinkButton from "@/components/tournament/TournamentInviteLinkButton";
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
  const [activeTab, setActiveTab] = useState<"overview" | "rounds" | "standings">("overview");

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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (viewer.isAnonymous) {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <GuestGate
            title="You\u2019ve been invited to a tournament"
            description="Sign in, or continue as a guest to take part."
            returnTo={currentHref}
          />
        </div>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-red-400 text-xl">{error ?? "Tournament not found"}</div>
      </div>
    );
  }

  const isHost = viewer.id === tournament.creatorId;
  const settings = tournament.settings as unknown as OpenTournamentSettings;
  const activeRound = tournament.rounds.find((r) => r.status === "active");
  const completedRounds = tournament.rounds.filter((r) => r.status === "completed");
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

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              <Link
                href="/open-tournaments"
                className="text-slate-400 hover:text-white text-sm"
              >
                Open Events
              </Link>
              <span className="text-slate-600">/</span>
              <h1 className="text-3xl font-fantaisie text-white">
                {tournament.name}
              </h1>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${
                  tournament.status === "active"
                    ? "bg-green-900/50 text-green-300 border-green-700"
                    : "bg-slate-700 text-slate-300 border-slate-600"
                }`}
              >
                {tournament.status}
              </span>
              {settings.gameFormat && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium border capitalize bg-slate-700 text-slate-300 border-slate-600">
                  {settings.gameFormat}
                </span>
              )}
              <span className="text-slate-400 text-sm">
                {activePlayerCount} players
              </span>
              {completedRounds.length > 0 && (
                <span className="text-slate-400 text-sm">
                  Round {completedRounds.length}
                  {activeRound ? ` (Round ${activeRound.roundNumber} active)` : " completed"}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Play Network Link */}
            {settings.playNetworkUrl && (
              <a
                href={settings.playNetworkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Play Network Event
              </a>
            )}

            {isHost && tournament.status === "active" && (
              <TournamentInviteLinkButton
                tournamentId={tournament.id}
                kind="open"
                inviteToken={
                  (tournament as { inviteToken?: string | null }).inviteToken ??
                  null
                }
                className="px-4 py-2 rounded-lg"
              />
            )}
            {/* Invite link visitor who is not seated yet: self-register */}
            {!isHost &&
              inviteToken &&
              tournament.status === "active" &&
              viewer.id &&
              !tournament.registrations.some(
                (r) => r.playerId === viewer.id && r.seatStatus === "active",
              ) && (
                <button
                  onClick={async () => {
                    setJoining(true);
                    setJoinError(null);
                    try {
                      const res = await fetch(
                        `/api/open-tournaments/${tournament.id}/join`,
                        {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ inviteToken }),
                        },
                      );
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(data.error ?? "Could not join");
                      await fetchTournament();
                    } catch (e) {
                      setJoinError(e instanceof Error ? e.message : "Could not join");
                    } finally {
                      setJoining(false);
                    }
                  }}
                  disabled={joining}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  title={joinError ?? undefined}
                >
                  {joining ? "Joining…" : joinError ? "Join failed - retry" : "Join tournament"}
                </button>
              )}
            {/* End Event Button (host only) */}
            {isHost && tournament.status === "active" && (
              <button
                onClick={handleEndEvent}
                className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                End Event
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-slate-700">
          {(["overview", "rounds", "standings"] as const).map((tab) => (
            <button
              key={tab}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-slate-400 hover:text-white"
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-3">Settings</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Pairing:</span>
                    <span className="text-white capitalize">{settings.pairing?.source ?? "swiss"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Play on Realms:</span>
                    <span className="text-white">{settings.matchResolution?.allowRealms ? "Yes" : "No"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Manual reporting:</span>
                    <span className="text-white">{settings.matchResolution?.allowManualReport ? "Yes" : "No"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Host approval:</span>
                    <span className="text-white">{settings.matchResolution?.requireHostApproval ? "Required" : "No"}</span>
                  </div>
                </div>
              </div>

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
                <h3 className="text-lg font-medium text-white mb-3">
                  Round {activeRound.roundNumber}
                  <span className="ml-2 text-xs px-2 py-0.5 bg-green-900/50 text-green-300 border border-green-700 rounded-full">
                    active
                  </span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <h3 className="text-lg font-medium text-white mb-3">
                  Round {round.roundNumber}
                  <span className="ml-2 text-xs px-2 py-0.5 bg-slate-700 text-slate-300 border border-slate-600 rounded-full">
                    completed
                  </span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div className="text-center py-8 text-slate-400">
                No rounds yet. {isHost ? "Create a round and generate pairings to start." : "Waiting for the host to start a round."}
              </div>
            )}
          </div>
        )}

        {activeTab === "standings" && (
          <OpenTournamentStandings standings={tournament.standings} />
        )}
      </div>
    </div>
  );
}
