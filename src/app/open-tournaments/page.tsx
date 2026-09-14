"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import GuestGate from "@/components/auth/GuestGate";
import { OpenTournamentCreateForm } from "@/components/open-tournament/OpenTournamentCreateForm";
import AppShell from "@/components/ui/AppShell";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { RcButton, RcLinkButton } from "@/components/ui/rc-button";
import { RcDialog } from "@/components/ui/rc-dialog";
import { RcEmpty } from "@/components/ui/rc-empty";
import { useViewer } from "@/lib/guest/useViewer";

interface OpenTournament {
  id: string;
  name: string;
  format: "open";
  status: string;
  maxPlayers: number;
  creatorId: string;
  createdAt: string;
  isPrivate?: boolean;
  settings?: Record<string, unknown>;
  registrations?: Array<{
    playerId: string;
    seatStatus: string;
    player: { id: string; name: string | null };
  }>;
  standings?: Array<{
    playerId: string;
    displayName: string;
    matchPoints: number;
  }>;
  rounds?: Array<{ id: string; roundNumber: number; status: string }>;
}

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

export default function OpenTournamentsPage() {
  const viewer = useViewer();
  const searchParams = useSearchParams();
  const pathnameForReturn = usePathname();
  const currentHref = `${pathnameForReturn ?? "/"}${
    searchParams?.toString() ? `?${searchParams.toString()}` : ""
  }`;
  const router = useRouter();
  const [tournaments, setTournaments] = useState<OpenTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<
    "active" | "completed" | "all"
  >("active");

  const fetchTournaments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("status", statusFilter);
      params.set("limit", "50");
      const res = await fetch(`/api/open-tournaments?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch");
      setTournaments(data.tournaments ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (viewer.id) {
      fetchTournaments();
    }
  }, [viewer.id, fetchTournaments]);

  const handleCreated = (tournamentId: string) => {
    setShowCreate(false);
    router.push(`/open-tournaments/${tournamentId}`);
  };

  if (viewer.status === "loading") {
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
          title="Open tournaments"
          description="Sign in to run a host-managed event, or continue as a guest to join one through an invite link."
          returnTo={currentHref}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow={
          <Link href="/tournaments" className="rc-link">
            Tournaments
          </Link>
        }
        title="Open Events"
        description="Play anywhere — on realms.cards, Tabletop Simulator, or in paper. Players report scores here, with optional host approval."
        actions={
          <RcButton onClick={() => setShowCreate(true)}>
            Create Open Event
          </RcButton>
        }
      />

      <p className="rc-hint -mt-3">
        Looking for fully automated events played on realms.cards?{" "}
        <Link href="/tournaments" className="rc-link">
          Platform Tournaments
        </Link>
      </p>

      {/* Filters */}
      <div className="rc-segment self-start">
        {(["active", "completed", "all"] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={statusFilter === f}
            onClick={() => setStatusFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rc-alert" data-tone="danger">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="rc-hint py-6 text-center">loading tournaments…</div>
      ) : tournaments.length === 0 ? (
        <RcEmpty
          title="No open events found."
          action={
            <RcButton variant="outline" onClick={() => setShowCreate(true)}>
              Create Open Event
            </RcButton>
          }
        >
          create an open event to get started
        </RcEmpty>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tournaments.map((t) => {
            const activePlayerCount =
              t.registrations?.filter((r) => r.seatStatus === "active")
                .length ?? 0;
            const currentRound = t.rounds?.[0];
            const playNetworkUrl = t.settings?.playNetworkUrl as
              string | undefined;
            const fillPercent = Math.min(
              (activePlayerCount / Math.max(1, t.maxPlayers)) * 100,
              100,
            );

            return (
              <div key={t.id} className="rc-panel flex flex-col p-[18px]">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3
                      className="m-0 truncate font-rc-display text-[22px] leading-[1.1] text-rc-fg-strong"
                      title={t.name}
                    >
                      {t.name}
                    </h3>
                    <p className="rc-hint mt-1">
                      Open Event · player-reported scores
                    </p>
                  </div>
                  <div
                    className={`flex shrink-0 items-center gap-2 font-rc-mono text-[11px] uppercase tracking-[0.14em] ${statusTone(
                      t.status,
                    )}`}
                  >
                    <span className="rc-dot" />
                    <span>{t.status}</span>
                  </div>
                </div>

                <div className="mb-4 space-y-2">
                  <div className="flex items-center justify-between font-rc-mono text-xs tracking-[0.1em]">
                    <span className="text-rc-fg-subtle">Players</span>
                    <span className="rc-stat">{activePlayerCount}</span>
                  </div>
                  <div className="rc-progress">
                    <span style={{ width: `${fillPercent}%` }} />
                  </div>
                  {currentRound && (
                    <div className="flex items-center justify-between font-rc-mono text-xs tracking-[0.1em]">
                      <span className="text-rc-fg-subtle">Round</span>
                      <span className="rc-stat">
                        {currentRound.roundNumber}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {playNetworkUrl && <Badge>Play Network linked</Badge>}
                    {t.isPrivate && <Badge tone="warn">Private</Badge>}
                  </div>
                </div>

                <RcLinkButton
                  variant="outline"
                  href={`/open-tournaments/${t.id}`}
                  className="mt-auto w-full"
                >
                  View Dashboard
                </RcLinkButton>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <RcDialog
          title="Create Open Event"
          onClose={() => setShowCreate(false)}
          size="md"
        >
          <OpenTournamentCreateForm onCreated={handleCreated} />
        </RcDialog>
      )}
    </AppShell>
  );
}
