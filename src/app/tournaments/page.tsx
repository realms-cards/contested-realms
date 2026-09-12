"use client";

import { Icon } from "@iconify/react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import GuestGate from "@/components/auth/GuestGate";
import AppShell from "@/components/ui/AppShell";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { RcButton, RcLinkButton } from "@/components/ui/rc-button";
import { RcDialog } from "@/components/ui/rc-dialog";
import { RcEmpty } from "@/components/ui/rc-empty";
import { useRealtimeTournaments } from "@/contexts/RealtimeTournamentContext";
import { useViewer } from "@/lib/guest/useViewer";
import {
  useAvailableSets,
  DEFAULT_SET,
  DEFAULT_DRAFTABLE_SETS,
} from "@/lib/hooks/useAvailableSets";
import { generateTournamentName } from "@/lib/random-name-generator";
interface Tournament {
  id: string;
  name: string;
  format: "sealed" | "draft" | "constructed";
  status: "registering" | "preparing" | "active" | "completed" | "cancelled";
  maxPlayers: number;
  currentPlayers: number;
  creatorId: string;
  startedAt: string | null;
  createdAt: string;
  completedAt: string | null;
  settings?: Record<string, unknown>;
  registeredPlayers?: Array<{ seatStatus?: string }>;
  isPrivate?: boolean;
}

interface CreateTournamentForm {
  name: string;
  format: "sealed" | "draft" | "constructed";
  maxPlayers: number;
  isPrivate: boolean;
  registrationMode: "fixed" | "open";
  registrationLocked: boolean;
  settings: {
    totalRounds?: number;
    roundDuration?: number;
    allowSpectators?: boolean;
    registration?: {
      mode?: "fixed" | "open";
      locked?: boolean;
    };
  };
}

/** Mono spaced-caps label above a form control. */
const FIELD_LABEL =
  "mb-1.5 block font-rc-mono text-[11px] uppercase tracking-[0.18em] text-rc-fg-subtle";

/** Boxed option row inside the create form. */
const OPTION_BOX = "rounded-rc-md border border-rc-line/18 bg-black/30 p-3.5";

/**
 * Checkbox row whose label wraps over several lines: `.rc-check` centres its
 * box, so multi-line rows get their own top-aligned variant.
 */
const CHECK_ROW_TOP =
  "flex cursor-pointer items-start gap-2 font-rc-mono text-xs leading-relaxed tracking-[0.06em] text-rc-fg-muted";

const CREATE_FORM_ID = "create-tournament-form";

export default function TournamentsPage() {
  const viewer = useViewer();
  const searchParams = useSearchParams();
  const pathnameForReturn = usePathname();
  const currentHref = `${pathnameForReturn ?? "/"}${
    searchParams?.toString() ? `?${searchParams.toString()}` : ""
  }`;
  const router = useRouter();
  const {
    tournaments,
    createTournament: rtCreateTournament,
    joinTournament: rtJoinTournament,
    loading: rtLoading,
    error: rtError,
  } = useRealtimeTournaments();
  // Only block with a full-screen loader on the very first load
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-generate tournament name when form opens
  const handleShowCreateForm = () => {
    setForm((prev) => ({ ...prev, name: generateTournamentName() }));
    setShowCreateForm(true);
  };

  // View filter: default 'active' uses realtime context; other filters fetch via API
  const [viewFilter, setViewFilter] = useState<
    "active" | "completed" | "all" | "mine"
  >("active");
  const [localTournaments, setLocalTournaments] = useState<Tournament[]>([]);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const [form, setForm] = useState<CreateTournamentForm>({
    name: "",
    format: "constructed",
    maxPlayers: 8,
    isPrivate: false,
    // Flexible (open-seat) registration is the default: players can join
    // after the tournament starts, which suits invite-link play
    registrationMode: "open",
    registrationLocked: false,
    settings: {
      totalRounds: 3,
      roundDuration: 45, // Default 45 minutes per round
      allowSpectators: true,
    },
  });

  // Host-only mode (creator doesn't play)
  const [hostOnlyMode, setHostOnlyMode] = useState(false);
  // Second Player Seer (2nd player scries 1 before game start), off by default
  const [enableSeer, setEnableSeer] = useState(false);
  // Round time limit in minutes
  const [roundTimeLimit, setRoundTimeLimit] = useState(45);
  // Timer warning threshold (minutes remaining) and tiebreak extra turns
  const [timerWarningMinutes, setTimerWarningMinutes] = useState(10);
  const [tiebreakExtraTurns, setTiebreakExtraTurns] = useState(5);

  // Fetch available sets from the database
  const { setNames: availableSetNames } = useAvailableSets();
  // Use fetched sets or fall back to defaults
  const draftableSets =
    availableSetNames.length > 0 ? availableSetNames : DEFAULT_DRAFTABLE_SETS;
  const defaultSetName = draftableSets[0] || DEFAULT_SET;

  // Pack configuration (pack size is fixed at 15; do not expose)
  // Tournament pairing format is always Swiss
  // New format: array of set names, one per booster
  const [sealedBoosterCount, setSealedBoosterCount] = useState<number>(6);
  const [sealedBoosters, setSealedBoosters] = useState<string[]>(() =>
    Array(6).fill(DEFAULT_SET),
  );
  const [draftBoosterCount, setDraftBoosterCount] = useState<number>(3);
  const [draftBoosters, setDraftBoosters] = useState<string[]>(() =>
    Array(3).fill(DEFAULT_SET),
  );

  // Time limit configuration
  const [sealedTimeLimit, setSealedTimeLimit] = useState<number>(40);
  const [draftPickTimeLimit, setDraftPickTimeLimit] = useState<number>(60);
  const [draftConstructionTimeLimit, setDraftConstructionTimeLimit] =
    useState<number>(20);

  // Cube support (for draft and sealed)
  const [useCube, setUseCube] = useState(false);
  const [cubeId, setCubeId] = useState<string>("");
  const [includeCubeSideboard, setIncludeCubeSideboard] =
    useState<boolean>(false);
  const [cubes, setCubes] = useState<Array<{ id: string; name: string }>>([]);
  // Sealed cube support
  const [sealedUseCube, setSealedUseCube] = useState(false);
  const [sealedCubeId, setSealedCubeId] = useState<string>("");
  const [sealedIncludeCubeSideboard, setSealedIncludeCubeSideboard] =
    useState<boolean>(false);

  // Free Avatars mode (removes avatars from packs, all available in deck editor)
  const [sealedFreeAvatars, setSealedFreeAvatars] = useState<boolean>(false);
  const [draftFreeAvatars, setDraftFreeAvatars] = useState<boolean>(false);

  // Pod size for draft tournaments (4-8, for tournaments with more than 8 players)
  const [draftPodSize, setDraftPodSize] = useState<number>(8);

  // Type guard helpers
  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
  function getCurrentPlayersCount(t: unknown): number {
    if (!isRecord(t)) return 0;
    const cp = t.currentPlayers;
    if (typeof cp === "number") return cp;
    const rp = (t as Record<string, unknown>).registeredPlayers;
    if (Array.isArray(rp)) {
      return rp.filter(
        (p) => (p as { seatStatus?: string }).seatStatus !== "vacant",
      ).length;
    }
    return 0;
  }

  // Mark initial load complete once auth resolved and realtime layer finished its first hydration
  useEffect(() => {
    if (!initialLoaded && viewer.status !== "loading" && !rtLoading) {
      setInitialLoaded(true);
    }
  }, [initialLoaded, viewer.status, rtLoading]);

  // Fetch available cubes for cube draft option
  useEffect(() => {
    async function loadCubes() {
      try {
        const resp = await fetch("/api/cubes");
        if (!resp.ok) return;
        const data = await resp.json();
        const allCubes = [
          ...(data.myCubes || []).map((c: { id: string; name: string }) => ({
            id: c.id,
            name: c.name,
          })),
          ...(data.publicCubes || []).map(
            (c: { id: string; name: string }) => ({ id: c.id, name: c.name }),
          ),
        ];
        setCubes(allCubes);
        if (allCubes.length > 0) {
          setCubeId(allCubes[0].id);
        }
      } catch (e) {
        console.warn("Failed to load cubes:", e);
      }
    }
    loadCubes();
  }, []);

  // Polling removed; realtime provider handles live updates

  // Load completed/all/mine tournaments when requested
  useEffect(() => {
    (async () => {
      if (viewFilter === "active") return;
      setLoadingLocal(true);
      setLocalError(null);
      try {
        const params = new URLSearchParams();
        if (viewFilter === "completed") {
          params.set("status", "completed");
          params.set("limit", String(pageSize));
          params.set("offset", String((page - 1) * pageSize));
          if (search.trim()) params.set("q", search.trim());
          const res = await fetch(`/api/tournaments?${params.toString()}`);
          const data = await res.json();
          if (!res.ok)
            throw new Error(data?.error || "Failed to fetch tournaments");
          setLocalTournaments(data as Tournament[]);
        } else if (viewFilter === "all") {
          params.set("status", "all");
          params.set("limit", String(pageSize));
          params.set("offset", String((page - 1) * pageSize));
          if (search.trim()) params.set("q", search.trim());
          const res = await fetch(`/api/tournaments?${params.toString()}`);
          const data = await res.json();
          if (!res.ok)
            throw new Error(data?.error || "Failed to fetch tournaments");
          setLocalTournaments(data as Tournament[]);
        } else if (viewFilter === "mine") {
          params.set("page", String(page));
          params.set("pageSize", String(pageSize));
          if (search.trim()) params.set("q", search.trim());
          // role=any returns both creator and participant
          const res = await fetch(`/api/tournaments/my?${params.toString()}`);
          const data = await res.json();
          if (!res.ok)
            throw new Error(data?.error || "Failed to fetch my tournaments");
          setLocalTournaments((data?.items || []) as Tournament[]);
        }
      } catch (e) {
        setLocalError(
          e instanceof Error ? e.message : "Failed to fetch tournaments",
        );
        setLocalTournaments([]);
      } finally {
        setLoadingLocal(false);
      }
    })();
  }, [viewFilter, page, search]);

  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewer.id) return;

    setCreating(true);
    setError(null);

    try {
      // Build settings with format-specific configuration
      // Pairing format is always Swiss
      const settingsOut: Record<string, unknown> = {
        ...(form.settings as Record<string, unknown>),
        pairingFormat: "swiss",
        registration: {
          mode: form.registrationMode,
          locked: form.registrationLocked,
        },
        // Round time limit (default 45 minutes)
        roundTimeLimit,
        matchTimeLimit: roundTimeLimit,
        // Host-only mode (creator doesn't play, just manages)
        creatorParticipates: !hostOnlyMode,
        // Second Player Seer (2nd player scries 1 before game start)
        enableSeer,
        // Tiebreaker settings for tournament matches
        tiebreakerSettings: {
          extraTurns: tiebreakExtraTurns, // Extra turns after time expires
          warningMinutes: timerWarningMinutes, // Timer warning threshold
          preventForcedDraws: true, // No simultaneous death
          allowDrawAgreement: false, // No draw agreements
        },
        // Disable forfeits by default
        allowForfeit: false,
      };
      if (form.format === "sealed") {
        if (sealedUseCube && sealedCubeId) {
          // Cube sealed mode
          settingsOut.sealedConfig = {
            packCounts: {},
            packCount: sealedBoosterCount,
            cubeId: sealedCubeId,
            timeLimit: sealedTimeLimit,
            includeCubeSideboardInStandard: sealedIncludeCubeSideboard,
            freeAvatars: sealedFreeAvatars,
          };
        } else {
          // Convert booster array to packCounts format for backend
          const packCounts: Record<string, number> = {};
          sealedBoosters.forEach((setName) => {
            packCounts[setName] = (packCounts[setName] || 0) + 1;
          });
          settingsOut.sealedConfig = {
            packCounts,
            timeLimit: sealedTimeLimit,
            freeAvatars: sealedFreeAvatars,
          };
        }
      } else if (form.format === "draft") {
        if (useCube && cubeId) {
          // Cube draft mode
          settingsOut.draftConfig = {
            cubeId,
            packCount: draftBoosterCount,
            pickTimeLimit: draftPickTimeLimit,
            constructionTimeLimit: draftConstructionTimeLimit,
            includeCubeSideboardInStandard: includeCubeSideboard,
            freeAvatars: draftFreeAvatars,
            podSize: draftPodSize, // Pod size for large tournaments
          };
        } else {
          // Regular set-based draft
          const packCounts: Record<string, number> = {};
          draftBoosters.forEach((setName) => {
            packCounts[setName] = (packCounts[setName] || 0) + 1;
          });
          settingsOut.draftConfig = {
            packCount: draftBoosterCount,
            packCounts,
            pickTimeLimit: draftPickTimeLimit,
            constructionTimeLimit: draftConstructionTimeLimit,
            freeAvatars: draftFreeAvatars,
            podSize: draftPodSize, // Pod size for large tournaments
          };
        }
      }

      const newTournament = await rtCreateTournament({
        name: form.name,
        format: form.format,
        maxPlayers: form.maxPlayers,
        isPrivate: form.isPrivate,
        settings: settingsOut,
      });

      // Add to local state immediately for better UX
      // Realtime context updates list; no manual setState needed

      // Reset form and close modal
      setForm({
        name: "",
        format: "constructed",
        maxPlayers: 8,
        isPrivate: false,
        registrationMode: "open",
        registrationLocked: false,
        settings: {
          totalRounds: 3,
          roundDuration: 60,
          allowSpectators: true,
        },
      });
      setSealedBoosterCount(6);
      setSealedBoosters(Array(6).fill(defaultSetName));
      setDraftBoosterCount(3);
      setDraftBoosters(Array(3).fill(defaultSetName));
      setEnableSeer(false);
      setUseCube(false);
      if (cubes.length > 0) {
        setCubeId(cubes[0].id);
      }
      setShowCreateForm(false);

      // Navigate to the new tournament
      router.push(`/tournaments/${newTournament.id}`);
    } catch (err) {
      console.error("Failed to create tournament:", err);
      setError(
        err instanceof Error ? err.message : "Failed to create tournament",
      );
    } finally {
      setCreating(false);
    }
  };

  const handleJoinTournament = async (tournamentId: string) => {
    if (!viewer.id) return;

    try {
      await rtJoinTournament(tournamentId);

      // Navigate to tournament page
      router.push(`/tournaments/${tournamentId}`);
    } catch (err) {
      console.error("Failed to join tournament:", err);
      setError(
        err instanceof Error ? err.message : "Failed to join tournament",
      );
    }
  };

  /** Status square + label colour, mirroring the lobby games table. */
  const getStatusTone = (status: Tournament["status"]) => {
    switch (status) {
      case "registering":
        return "text-rc-success";
      case "preparing":
        return "text-rc-warning";
      case "active":
        return "text-rc-danger";
      case "completed":
        return "text-rc-fg-dim";
      case "cancelled":
        return "text-rc-danger";
      default:
        return "text-rc-fg-dim";
    }
  };

  const getFormatIcon = (format: Tournament["format"]) => {
    switch (format) {
      case "sealed":
        return "game-icons:cardboard-box-closed";
      case "draft":
        return "game-icons:card-pick";
      case "constructed":
        return "game-icons:crossed-swords";
      default:
        return "game-icons:laurels-trophy";
    }
  };

  if (
    viewer.status === "loading" ||
    (rtLoading && !initialLoaded && !viewer.isAnonymous)
  ) {
    return (
      <AppShell>
        <div className="rc-hint py-6 text-center">loading tournaments…</div>
      </AppShell>
    );
  }

  if (viewer.isAnonymous) {
    return (
      <AppShell width="narrow">
        <GuestGate
          variant="realms"
          title="Tournaments"
          description="Sign in to create and play tournaments, or continue as a guest to browse them and join through an invite link."
          returnTo={currentHref}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Competitive play"
        title="Tournaments"
        description="Competitive events played on realms.cards — results are recorded automatically"
        actions={
          <>
            <RcLinkButton variant="ghost" href="/online/lobby">
              Back to Lobby
            </RcLinkButton>
            <RcButton onClick={handleShowCreateForm}>
              Create Tournament
            </RcButton>
          </>
        }
      />

      {/* Tournament type chooser */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-rc-lg border border-rc-accent/35 bg-rc-panel p-[18px] shadow-rc-panel">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <h2 className="m-0 font-rc-display text-[22px] leading-none text-rc-fg-strong">
              Platform Tournaments
            </h2>
            <Badge tone="gold">This page</Badge>
          </div>
          <p className="m-0 font-rc-sans text-sm leading-relaxed text-rc-fg-muted">
            Sealed, draft, and constructed events where every match is played
            here on realms.cards. Pairings, results, and standings are fully
            automated.
          </p>
        </div>
        <Link
          href="/open-tournaments"
          className="group block rounded-rc-lg border border-rc-line/18 bg-rc-panel p-[18px] shadow-rc-panel transition-colors hover:border-rc-accent/45"
        >
          <h2 className="m-0 mb-1.5 font-rc-display text-[22px] leading-none text-rc-fg-strong">
            Open Events
          </h2>
          <p className="m-0 font-rc-sans text-sm leading-relaxed text-rc-fg-muted">
            Play anywhere — on realms.cards, Tabletop Simulator, or in paper.
            Players report their scores and standings are tracked here, with
            optional host approval.
          </p>
          <span className="mt-2 inline-block font-rc-mono text-[11px] uppercase tracking-[0.18em] text-rc-accent-link transition-colors group-hover:text-rc-accent-ring">
            Browse Open Events
          </span>
        </Link>
      </div>

      {/* View Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="rc-segment">
          <button
            type="button"
            aria-pressed={viewFilter === "active"}
            onClick={() => setViewFilter("active")}
          >
            Active
          </button>
          <button
            type="button"
            aria-pressed={viewFilter === "completed"}
            onClick={() => setViewFilter("completed")}
          >
            Completed
          </button>
          <button
            type="button"
            aria-pressed={viewFilter === "all"}
            onClick={() => setViewFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            aria-pressed={viewFilter === "mine"}
            onClick={() => {
              setViewFilter("mine");
              setPage(1);
            }}
          >
            My Tournaments
          </button>
        </div>
        {viewFilter !== "active" && (
          <span className="rc-hint">Showing {viewFilter} tournaments</span>
        )}
        {viewFilter !== "active" && (
          <div className="ml-auto flex items-center gap-2">
            <input
              type="search"
              name="q"
              autoComplete="off"
              role="searchbox"
              inputMode="search"
              data-1p-ignore
              data-lpignore="true"
              data-bwignore="true"
              data-dashlane-ignore="true"
              data-np-ignore="true"
              data-keeper-lock="true"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search…"
              className="rc-input h-9 min-w-[200px]"
            />
          </div>
        )}
      </div>

      {/* Error Display */}
      {(error || rtError || localError) && (
        <div className="rc-alert" data-tone="danger">
          {error || rtError || localError}
        </div>
      )}

      {/* Pagination for non-active views */}
      {viewFilter !== "active" && (
        <div className="flex items-center justify-center gap-3">
          <RcButton
            variant="outline"
            size="sm"
            disabled={page <= 1 || loadingLocal}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </RcButton>
          <span className="rc-hint">Page {page}</span>
          <RcButton
            variant="outline"
            size="sm"
            disabled={loadingLocal || localTournaments.length < pageSize}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </RcButton>
        </div>
      )}

      {/* Tournaments Grid */}
      {(
        viewFilter === "active"
          ? tournaments.length === 0
          : loadingLocal
            ? false
            : localTournaments.length === 0
      ) ? (
        <RcEmpty
          title={
                <>
                  <Icon
                    icon="game-icons:laurels-trophy"
                    className="mx-auto mb-3 block text-rc-fg-dim"
                    width={56}
                    height={56}
                    aria-hidden="true"
                  />
                  No tournaments found.
                </>
              }
          action={
            viewFilter === "active" ? (
              <RcButton onClick={handleShowCreateForm}>
                Create Tournament
              </RcButton>
            ) : undefined
          }
        >
          {viewFilter === "active"
            ? ""
            : "try switching filters or check back later"}
        </RcEmpty>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(viewFilter === "active" ? tournaments : localTournaments).map(
            (tournament) => {
              const registrationSettings = (
                tournament as unknown as {
                  settings?: Record<string, unknown>;
                }
              ).settings?.registration as Record<string, unknown> | undefined;
              const isOpenSeat = registrationSettings?.mode === "open";
              const isLocked = registrationSettings?.locked === true;
              const registeredPlayers =
                (
                  tournament as unknown as {
                    registeredPlayers?: Array<{ seatStatus?: string }>;
                  }
                ).registeredPlayers ?? [];
              const activeCount = getCurrentPlayersCount(tournament);
              const vacantCount = Math.max(
                0,
                registeredPlayers.filter((p) => p.seatStatus === "vacant")
                  .length,
              );
              const canJoin = isOpenSeat
                ? vacantCount > 0 ||
                  (!isLocked &&
                    (tournament.status === "registering" ||
                      tournament.status === "preparing"))
                : tournament.status === "registering" &&
                  activeCount < tournament.maxPlayers;

              return (
                <div
                  key={tournament.id}
                  className="rc-panel flex flex-col p-[18px]"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3
                        className="m-0 truncate font-rc-display text-[22px] leading-[1.1] text-rc-fg-strong"
                        title={tournament.name}
                      >
                        {tournament.name}
                      </h3>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <Badge>
                          <Icon
                            icon={getFormatIcon(tournament.format)}
                            width={13}
                            height={13}
                            aria-hidden="true"
                          />
                          {tournament.format}
                        </Badge>
                        {(tournament as unknown as { isPrivate?: boolean })
                          .isPrivate && (
                          <Badge tone="warn">
                            <Icon
                              icon="game-icons:padlock"
                              width={11}
                              height={11}
                              aria-hidden="true"
                            />
                            Private
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div
                      className={`flex shrink-0 items-center gap-2 font-rc-mono text-[11px] uppercase tracking-[0.14em] ${getStatusTone(
                        tournament.status,
                      )}`}
                    >
                      <span className="rc-dot" />
                      <span>{tournament.status}</span>
                    </div>
                  </div>

                  <div className="mb-4 space-y-2">
                    <div className="flex items-center justify-between font-rc-mono text-xs tracking-[0.1em]">
                      <span className="text-rc-fg-subtle">Players</span>
                      <span className="rc-stat">
                        {activeCount}
                        {isOpenSeat ? "" : `/${tournament.maxPlayers}`}
                      </span>
                    </div>

                    <div className="rc-progress">
                      <span
                        style={{
                          width: `${Math.min(
                            (activeCount / tournament.maxPlayers) * 100,
                            100,
                          )}%`,
                        }}
                      />
                    </div>
                    {isOpenSeat && (
                      <div className="flex justify-between gap-2 font-rc-mono text-[11px] tracking-[0.1em] text-rc-fg-subtle">
                        <span>Open Seat: {isLocked ? "Locked" : "Open"}</span>
                        {vacantCount > 0 && <span>Vacant: {vacantCount}</span>}
                      </div>
                    )}

                    {tournament.startedAt && (
                      <div className="flex items-center justify-between font-rc-mono text-xs tracking-[0.1em]">
                        <span className="text-rc-fg-subtle">Started</span>
                        <span className="rc-stat">
                          {new Date(tournament.startedAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-auto flex gap-2">
                    <RcLinkButton
                      variant="outline"
                      href={`/tournaments/${tournament.id}`}
                      className="flex-1"
                    >
                      View Details
                    </RcLinkButton>

                    {canJoin && (
                      <RcButton
                        onClick={() => handleJoinTournament(tournament.id)}
                        className="flex-1"
                      >
                        Join
                      </RcButton>
                    )}
                  </div>
                </div>
              );
            },
          )}
        </div>
      )}

      {/* Create Tournament Modal */}
      {showCreateForm && (
        <RcDialog
          title="Create Tournament"
          size="lg"
          onClose={() => setShowCreateForm(false)}
          actions={
            <>
              <RcButton
                variant="outline"
                onClick={() => setShowCreateForm(false)}
                disabled={creating}
              >
                Cancel
              </RcButton>
              <RcButton type="submit" form={CREATE_FORM_ID} disabled={creating}>
                {creating ? "Creating..." : "Create Tournament"}
              </RcButton>
            </>
          }
        >
          <p className="mb-4 text-sm leading-relaxed text-rc-fg-muted">
            All matches in this tournament are played on realms.cards and
            results are recorded automatically. Planning to play on Tabletop
            Simulator or in paper?{" "}
            <Link href="/open-tournaments" className="rc-link">
              Create an Open Event instead
            </Link>
          </p>

          <form
            id={CREATE_FORM_ID}
            onSubmit={handleCreateTournament}
            className="space-y-4"
          >
            <div>
              <label className={FIELD_LABEL}>Tournament Name</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="rc-input h-10 min-w-0 flex-1"
                  placeholder="Enter tournament name"
                  required
                />
                <RcButton
                  variant="outline"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      name: generateTournamentName(),
                    }))
                  }
                  title="Generate random name"
                >
                  Random
                </RcButton>
              </div>
            </div>

            {/* Privacy Toggle */}
            <div>
              <label className="rc-check">
                <input
                  type="checkbox"
                  checked={form.isPrivate}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      isPrivate: e.target.checked,
                    }))
                  }
                />
                Private tournament (invite-only)
              </label>
              {form.isPrivate && (
                <p className="rc-hint ml-6 mt-1">
                  Only invited players can see and join this tournament
                </p>
              )}
            </div>
            <div className={OPTION_BOX}>
              <label className={CHECK_ROW_TOP}>
                <input
                  type="checkbox"
                  className="mt-0.5 accent-rc-accent"
                  checked={form.registrationMode === "open"}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      registrationMode: e.target.checked ? "open" : "fixed",
                      registrationLocked: e.target.checked
                        ? prev.registrationLocked
                        : false,
                    }))
                  }
                />
                <span>
                  <span className="block text-[13px] uppercase tracking-[0.14em] text-rc-fg-strong">
                    Flexible Registration
                  </span>
                  <span className="mt-0.5 block tracking-[0.04em] text-rc-fg-subtle">
                    Players can join or leave freely. You control when to lock
                    registration and start.
                  </span>
                </span>
              </label>
              {form.registrationMode === "open" && (
                <label className="rc-check ml-6 mt-2">
                  <input
                    type="checkbox"
                    checked={form.registrationLocked}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        registrationLocked: e.target.checked,
                      }))
                    }
                  />
                  Start with registration locked
                </label>
              )}
            </div>

            {/* Tournament Structure Row */}
            <div className="flex flex-wrap gap-4">
              <div>
                <label className={FIELD_LABEL}>Format</label>
                <CustomSelect
                  value={form.format}
                  onChange={(v) =>
                    setForm((prev) => ({
                      ...prev,
                      format: v as "sealed" | "draft" | "constructed",
                    }))
                  }
                  options={[
                    { value: "constructed", label: "Constructed" },
                    { value: "sealed", label: "Sealed" },
                    { value: "draft", label: "Draft" },
                  ]}
                />
              </div>
              <div>
                <label className={FIELD_LABEL}>
                  {form.registrationMode === "open" ? "Seat Cap" : "Players"}
                </label>
                {form.registrationMode === "open" ? (
                  <input
                    type="number"
                    min={2}
                    max={128}
                    value={form.maxPlayers}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        maxPlayers: Math.max(
                          2,
                          Math.min(128, parseInt(e.target.value) || 2),
                        ),
                      }))
                    }
                    className="rc-input h-10 w-24"
                  />
                ) : (
                  <CustomSelect
                    value={String(form.maxPlayers)}
                    onChange={(v) =>
                      setForm((prev) => ({
                        ...prev,
                        maxPlayers: parseInt(v),
                      }))
                    }
                    options={[
                      { value: "2", label: "2" },
                      { value: "4", label: "4" },
                      { value: "8", label: "8" },
                      { value: "16", label: "16" },
                      { value: "32", label: "32" },
                      { value: "64", label: "64" },
                    ]}
                  />
                )}
              </div>
              <div>
                <label className={FIELD_LABEL}>Rounds</label>
                <CustomSelect
                  value={String(form.settings.totalRounds || 3)}
                  onChange={(v) =>
                    setForm((prev) => ({
                      ...prev,
                      settings: {
                        ...prev.settings,
                        totalRounds: parseInt(v),
                      },
                    }))
                  }
                  options={[
                    { value: "2", label: "2" },
                    { value: "3", label: "3" },
                    { value: "4", label: "4" },
                    { value: "5", label: "5" },
                  ]}
                />
              </div>
              <div>
                <label className={FIELD_LABEL}>Round Time</label>
                <CustomSelect
                  value={String(roundTimeLimit)}
                  onChange={(v) => setRoundTimeLimit(parseInt(v))}
                  options={[
                    { value: "30", label: "30 min" },
                    { value: "45", label: "45 min" },
                    { value: "60", label: "60 min" },
                    { value: "90", label: "90 min" },
                  ]}
                />
              </div>
            </div>

            {/* Timer warning + tiebreak extra turns */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={FIELD_LABEL}>Timer Warning At</label>
                <CustomSelect
                  value={String(timerWarningMinutes)}
                  onChange={(v) => setTimerWarningMinutes(parseInt(v))}
                  options={[
                    { value: "5", label: "5 min left" },
                    { value: "10", label: "10 min left" },
                    { value: "15", label: "15 min left" },
                  ]}
                />
              </div>
              <div>
                <label className={FIELD_LABEL}>Extra Turns (Tiebreak)</label>
                <CustomSelect
                  value={String(tiebreakExtraTurns)}
                  onChange={(v) => setTiebreakExtraTurns(parseInt(v))}
                  options={[
                    { value: "0", label: "None" },
                    { value: "3", label: "3 turns" },
                    { value: "5", label: "5 turns" },
                    { value: "10", label: "10 turns" },
                  ]}
                />
                <p className="rc-hint mt-1.5 leading-relaxed">
                  Played after time expires, then the tiebreaker decides the
                  match.
                </p>
              </div>
            </div>

            {/* Host-Only Mode */}
            <div className={OPTION_BOX}>
              <label className={CHECK_ROW_TOP}>
                <input
                  type="checkbox"
                  className="mt-0.5 accent-rc-accent"
                  checked={hostOnlyMode}
                  onChange={(e) => setHostOnlyMode(e.target.checked)}
                />
                <span>
                  <span className="block text-[13px] uppercase tracking-[0.14em] text-rc-fg-strong">
                    Host Only Mode
                  </span>
                  <span className="mt-0.5 block tracking-[0.04em] text-rc-fg-subtle">
                    You will manage the tournament but not participate as a
                    player.
                  </span>
                </span>
              </label>
            </div>

            {/* Second Player Seer */}
            <div className={OPTION_BOX}>
              <label className={CHECK_ROW_TOP}>
                <input
                  type="checkbox"
                  className="mt-0.5 accent-rc-accent"
                  checked={enableSeer}
                  onChange={(e) => setEnableSeer(e.target.checked)}
                />
                <span>
                  <span className="block text-[13px] uppercase tracking-[0.14em] text-rc-fg-strong">
                    Enable Second Seer
                  </span>
                  <span className="mt-0.5 block tracking-[0.04em] text-rc-fg-subtle">
                    The second player scries 1 before each game starts.
                  </span>
                </span>
              </label>
            </div>

            {/* Sealed Booster Configuration */}
            {form.format === "sealed" && (
              <div className={`${OPTION_BOX} space-y-3`}>
                {/* Cube sealed toggle */}
                <label className="rc-check">
                  <input
                    type="checkbox"
                    checked={sealedUseCube}
                    onChange={(e) => setSealedUseCube(e.target.checked)}
                  />
                  Use Cube for sealed
                </label>

                {sealedUseCube ? (
                  /* Cube selector + pack count */
                  <div className="space-y-2">
                    <div>
                      <label className={FIELD_LABEL}>Select Cube</label>
                      <CustomSelect
                        value={sealedCubeId}
                        onChange={(v) => setSealedCubeId(v)}
                        disabled={cubes.length === 0}
                        className="w-full"
                        placeholder={
                          cubes.length === 0
                            ? "No cubes available"
                            : "-- Select a cube --"
                        }
                        options={cubes.map((cube) => ({
                          value: cube.id,
                          label: cube.name,
                        }))}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className={`${FIELD_LABEL} mb-0`}>
                        Pack Count
                      </label>
                      <div className="flex items-center gap-2">
                        <RcButton
                          variant="outline"
                          size="sm"
                          aria-label="Fewer packs"
                          onClick={() =>
                            setSealedBoosterCount((c) => Math.max(1, c - 1))
                          }
                          className="w-9 px-0"
                        >
                          -
                        </RcButton>
                        <span className="rc-stat w-10 text-center">
                          {sealedBoosterCount}
                        </span>
                        <RcButton
                          variant="outline"
                          size="sm"
                          aria-label="More packs"
                          onClick={() =>
                            setSealedBoosterCount((c) => Math.min(10, c + 1))
                          }
                          className="w-9 px-0"
                        >
                          +
                        </RcButton>
                      </div>
                    </div>
                    <label className={CHECK_ROW_TOP}>
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-rc-accent"
                        checked={sealedIncludeCubeSideboard}
                        onChange={(e) =>
                          setSealedIncludeCubeSideboard(e.target.checked)
                        }
                      />
                      <span className="tracking-[0.04em]">
                        Include cube&apos;s sideboard cards in the standard card
                        pool during deckbuilding.
                      </span>
                    </label>
                  </div>
                ) : (
                  /* Set-based booster configuration */
                  <>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className={`${FIELD_LABEL} mb-0`}>
                        Booster Count
                      </label>
                      <div className="flex items-center gap-2">
                        <RcButton
                          variant="outline"
                          size="sm"
                          aria-label="Fewer boosters"
                          onClick={() => {
                            const newCount = Math.max(
                              1,
                              sealedBoosterCount - 1,
                            );
                            setSealedBoosterCount(newCount);
                            setSealedBoosters((prev) =>
                              prev.slice(0, newCount),
                            );
                          }}
                          className="w-9 px-0"
                        >
                          -
                        </RcButton>
                        <span className="rc-stat w-10 text-center">
                          {sealedBoosterCount}
                        </span>
                        <RcButton
                          variant="outline"
                          size="sm"
                          aria-label="More boosters"
                          onClick={() => {
                            const newCount = Math.min(
                              10,
                              sealedBoosterCount + 1,
                            );
                            setSealedBoosterCount(newCount);
                            setSealedBoosters((prev) => [
                              ...prev,
                              ...Array(newCount - prev.length).fill(
                                defaultSetName,
                              ),
                            ]);
                          }}
                          className="w-9 px-0"
                        >
                          +
                        </RcButton>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {sealedBoosters.map((setName, idx) => (
                        <div
                          key={`sealed-booster-${idx}`}
                          className="flex items-center gap-2"
                        >
                          <div className="w-16 shrink-0 font-rc-mono text-[11px] uppercase tracking-[0.14em] text-rc-fg-subtle">
                            Pack {idx + 1}
                          </div>
                          <CustomSelect
                            value={setName}
                            onChange={(v) => {
                              setSealedBoosters((prev) => {
                                const next = [...prev];
                                next[idx] = v;
                                return next;
                              });
                            }}
                            className="flex-1"
                            options={draftableSets.map((name) => ({
                              value: name,
                              label: name,
                            }))}
                          />
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Sealed Time Limit */}
                <div>
                  <label className={FIELD_LABEL}>Time Limit (minutes)</label>
                  <input
                    type="number"
                    min={10}
                    max={90}
                    step={5}
                    value={sealedTimeLimit}
                    onChange={(e) =>
                      setSealedTimeLimit(
                        Math.max(
                          10,
                          Math.min(90, parseInt(e.target.value) || 40),
                        ),
                      )
                    }
                    className="rc-input h-10 w-full"
                  />
                  <p className="rc-hint mt-1.5 leading-relaxed">
                    Warning-only time limit for deck construction (10-90
                    minutes)
                  </p>
                </div>

                {/* Free Avatars Toggle */}
                <label className={CHECK_ROW_TOP}>
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-rc-accent"
                    checked={sealedFreeAvatars}
                    onChange={(e) => setSealedFreeAvatars(e.target.checked)}
                  />
                  <span className="tracking-[0.04em]">
                    Free Avatars (remove from packs, all available in deck
                    editor)
                  </span>
                </label>
              </div>
            )}

            {/* Draft Booster Configuration */}
            {form.format === "draft" && (
              <div className={`${OPTION_BOX} space-y-3`}>
                {/* Cube draft toggle */}
                <label className="rc-check">
                  <input
                    type="checkbox"
                    checked={useCube}
                    onChange={(e) => setUseCube(e.target.checked)}
                  />
                  Use Cube for draft
                </label>

                {useCube ? (
                  /* Cube selector + sideboard option */
                  <div className="space-y-2">
                    <div>
                      <label className={FIELD_LABEL}>Select Cube</label>
                      <CustomSelect
                        value={cubeId}
                        onChange={(v) => setCubeId(v)}
                        disabled={cubes.length === 0}
                        className="w-full"
                        placeholder={
                          cubes.length === 0
                            ? "No cubes available"
                            : "-- Select a cube --"
                        }
                        options={cubes.map((cube) => ({
                          value: cube.id,
                          label: cube.name,
                        }))}
                      />
                    </div>
                    <label className={CHECK_ROW_TOP}>
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-rc-accent"
                        checked={includeCubeSideboard}
                        onChange={(e) =>
                          setIncludeCubeSideboard(e.target.checked)
                        }
                      />
                      <span className="tracking-[0.04em]">
                        When drafting from a cube, offer the cube&apos;s
                        sideboard cards in the standard card pool during
                        deckbuilding.
                      </span>
                    </label>
                  </div>
                ) : (
                  /* Set-based booster configuration */
                  <>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className={`${FIELD_LABEL} mb-0`}>
                        Booster Count
                      </label>
                      <div className="flex items-center gap-2">
                        <RcButton
                          variant="outline"
                          size="sm"
                          aria-label="Fewer boosters"
                          onClick={() => {
                            const newCount = Math.max(1, draftBoosterCount - 1);
                            setDraftBoosterCount(newCount);
                            setDraftBoosters((prev) => prev.slice(0, newCount));
                          }}
                          className="w-9 px-0"
                        >
                          -
                        </RcButton>
                        <span className="rc-stat w-10 text-center">
                          {draftBoosterCount}
                        </span>
                        <RcButton
                          variant="outline"
                          size="sm"
                          aria-label="More boosters"
                          onClick={() => {
                            const newCount = Math.min(5, draftBoosterCount + 1);
                            setDraftBoosterCount(newCount);
                            setDraftBoosters((prev) => [
                              ...prev,
                              ...Array(newCount - prev.length).fill(
                                defaultSetName,
                              ),
                            ]);
                          }}
                          className="w-9 px-0"
                        >
                          +
                        </RcButton>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {draftBoosters.map((setName, idx) => (
                        <div
                          key={`draft-booster-${idx}`}
                          className="flex items-center gap-2"
                        >
                          <div className="w-16 shrink-0 font-rc-mono text-[11px] uppercase tracking-[0.14em] text-rc-fg-subtle">
                            Pack {idx + 1}
                          </div>
                          <CustomSelect
                            value={setName}
                            onChange={(v) => {
                              setDraftBoosters((prev) => {
                                const next = [...prev];
                                next[idx] = v;
                                return next;
                              });
                            }}
                            className="flex-1"
                            options={draftableSets.map((name) => ({
                              value: name,
                              label: name,
                            }))}
                          />
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Draft Time Limits */}
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className={FIELD_LABEL}>Pick Time Limit (sec)</label>
                    <input
                      type="number"
                      min={30}
                      max={300}
                      step={15}
                      value={draftPickTimeLimit}
                      onChange={(e) =>
                        setDraftPickTimeLimit(
                          Math.max(
                            30,
                            Math.min(300, parseInt(e.target.value) || 60),
                          ),
                        )
                      }
                      className="rc-input h-10 w-full"
                    />
                    <p className="rc-hint mt-1.5">
                      Time per pick (30-300 seconds)
                    </p>
                  </div>
                  <div>
                    <label className={FIELD_LABEL}>
                      Construction Time (min)
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={60}
                      step={5}
                      value={draftConstructionTimeLimit}
                      onChange={(e) =>
                        setDraftConstructionTimeLimit(
                          Math.max(
                            10,
                            Math.min(60, parseInt(e.target.value) || 20),
                          ),
                        )
                      }
                      className="rc-input h-10 w-full"
                    />
                    <p className="rc-hint mt-1.5">
                      Deck building (10-60 minutes)
                    </p>
                  </div>
                </div>

                {/* Free Avatars Toggle */}
                <label className={`${CHECK_ROW_TOP} mt-3`}>
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-rc-accent"
                    checked={draftFreeAvatars}
                    onChange={(e) => setDraftFreeAvatars(e.target.checked)}
                  />
                  <span className="tracking-[0.04em]">
                    Free Avatars (remove from packs, all available in deck
                    editor)
                  </span>
                </label>

                {/* Pod Size for large tournaments */}
                {form.maxPlayers > 8 && (
                  <div className="mt-3 rounded-rc-md border border-rc-warning/35 bg-rc-warning/10 p-3">
                    <label className={FIELD_LABEL}>Draft Pod Size</label>
                    <p className="rc-hint mb-2 leading-relaxed">
                      For tournaments with more than 8 players, players will be
                      split into pods.
                    </p>
                    <CustomSelect
                      value={String(draftPodSize)}
                      onChange={(v) => setDraftPodSize(parseInt(v))}
                      options={[
                        { value: "4", label: "4 players per pod" },
                        { value: "5", label: "5 players per pod" },
                        { value: "6", label: "6 players per pod" },
                        { value: "7", label: "7 players per pod" },
                        { value: "8", label: "8 players per pod" },
                      ]}
                    />
                  </div>
                )}
              </div>
            )}
          </form>
        </RcDialog>
      )}
    </AppShell>
  );
}
