import {
  InvitationStatus,
  TournamentFormat,
  TournamentStatus,
} from "@prisma/client";
import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { withCache, CacheKeys, invalidateCache } from "@/lib/cache/redis-cache";
import { logPerformance } from "@/lib/monitoring/performance";
import { prisma } from "@/lib/prisma";
import { tournamentSocketService } from "@/lib/services/tournament-broadcast";

export const dynamic = "force-dynamic";

// GET /api/tournaments
// Returns all active tournaments
export async function GET(req: NextRequest) {
  const startTime = performance.now();
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const url = new URL(req.url);
    const sp = url.searchParams;
    const statusParam = sp.get("status"); // e.g. 'completed', 'active', 'all', or 'registering,preparing,active,completed'
    const q = (sp.get("q") || "").trim();
    const includeCompleted = sp.get("includeCompleted") === "true";
    const limit = Math.max(
      1,
      Math.min(100, Number(sp.get("limit") || 50) || 50)
    );
    const offset = Math.max(0, Number(sp.get("offset") || 0) || 0);

    // Default statuses: only active/open tournaments
    let statuses: TournamentStatus[] | null = [
      "registering",
      "preparing",
      "active",
    ] as TournamentStatus[];
    if (statusParam) {
      if (statusParam === "all") {
        statuses = null; // no status filter
      } else {
        const parts = statusParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const allowed = new Set([
          "registering",
          "preparing",
          "active",
          "completed",
          "cancelled",
        ]);
        const parsed = parts.filter((p) =>
          allowed.has(p)
        ) as TournamentStatus[];
        statuses = parsed.length ? parsed : statuses;
      }
    } else if (includeCompleted) {
      statuses = [
        "registering",
        "preparing",
        "active",
        "completed",
      ] as TournamentStatus[];
    }

    console.log("Fetching tournaments...", {
      statuses: statuses ?? "ALL",
      limit,
      offset,
    });

    // Store userId for use in cache and queries
    const userId = session.user.id;

    // Generate cache key based on query parameters and user
    const cacheKey = CacheKeys.tournaments.list({
      userId,
      status: statusParam,
      q,
      includeCompleted,
      limit,
      offset,
    });

    // Wrap database query with Redis cache (10 second TTL for high-traffic route)
    const tournaments = await withCache(
      cacheKey,
      async () => {
        // Build where clause - filter out private tournaments unless user is creator or has invitation
        const where = {
          ...(statuses ? { status: { in: statuses } } : {}),
          ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
          // Show public tournaments + private tournaments where user is creator or invited
          OR: [
            { isPrivate: false },
            { creatorId: userId },
            {
              invitations: {
                some: {
                  inviteeId: userId,
                  status: {
                    in: [
                      "pending" as InvitationStatus,
                      "accepted" as InvitationStatus,
                    ],
                  },
                },
              },
            },
            {
              registrations: {
                some: {
                  playerId: userId,
                },
              },
            },
          ],
        };

        return await prisma.tournament.findMany({
          where,
          include: {
            registrations: {
              include: {
                player: {
                  select: { id: true, name: true },
                },
              },
            },
            standings: true,
            // Note: Removed rounds/matches include for performance - they're not used in the list view
            // Individual tournament pages load rounds separately when needed
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        });
      },
      { ttl: 10 } // 10 second cache for frequently changing tournament data
    );

    console.log("Found tournaments:", tournaments.length);

    // Debug tournament registrations
    tournaments.forEach((tournament) => {
      console.log(
        `Tournament ${tournament.name} has ${tournament.registrations.length} registrations:`,
        tournament.registrations.map((reg) => ({
          playerId: reg.playerId,
          playerName: reg.player?.name,
          hasPlayer: !!reg.player,
        }))
      );
    });

    // Transform to match protocol format
    const tournamentInfos = tournaments.map((tournament) => ({
      id: tournament.id,
      name: tournament.name,
      creatorId: tournament.creatorId,
      format: tournament.format,
      status: tournament.status,
      maxPlayers: tournament.maxPlayers,
      isPrivate: tournament.isPrivate,
      currentPlayers: tournament.registrations.length,
      registeredPlayers: tournament.registrations.map((reg) => {
        const prepData = reg.preparationData as Record<string, unknown> | null;
        return {
          id: reg.playerId,
          displayName: reg.player.name || "Anonymous",
          ready: Boolean(prepData?.ready),
          deckSubmitted: Boolean(reg.deckSubmitted),
        };
      }),
      standings: tournament.standings.map((standing) => ({
        playerId: standing.playerId,
        displayName: standing.displayName,
        wins: standing.wins,
        losses: standing.losses,
        draws: standing.draws,
        matchPoints: standing.matchPoints,
        gameWinPercentage: standing.gameWinPercentage,
        opponentMatchWinPercentage: standing.opponentMatchWinPercentage,
        isEliminated: standing.isEliminated,
        currentMatchId: standing.currentMatchId,
      })),
      // Rounds are loaded separately by individual tournament pages for performance
      totalRounds:
        ((tournament.settings as Record<string, unknown>)
          ?.totalRounds as number) || 3,
      settings: tournament.settings,
      createdAt:
        typeof tournament.createdAt === "string"
          ? new Date(tournament.createdAt).getTime()
          : tournament.createdAt.getTime(),
      startedAt: tournament.startedAt
        ? typeof tournament.startedAt === "string"
          ? new Date(tournament.startedAt).getTime()
          : tournament.startedAt.getTime()
        : undefined,
      completedAt: tournament.completedAt
        ? typeof tournament.completedAt === "string"
          ? new Date(tournament.completedAt).getTime()
          : tournament.completedAt.getTime()
        : undefined,
    }));

    logPerformance("GET /api/tournaments", performance.now() - startTime);
    return new Response(JSON.stringify(tournamentInfos), {
      status: 200,
      headers: {
        "content-type": "application/json",
        // Short-lived private cache to reduce DB load during bursts
        "Cache-Control": "private, max-age=3",
      },
    });
  } catch (e: unknown) {
    console.error("Error fetching tournaments:", e);
    logPerformance("GET /api/tournaments", performance.now() - startTime);
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
        ? e
        : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

// POST /api/tournaments
// Body: { name: string, format: 'swiss' | 'elimination' | 'round_robin', matchType: 'constructed' | 'sealed' | 'draft', maxPlayers: number, isPrivate?: boolean, sealedConfig?: any, draftConfig?: any }
export async function POST(req: NextRequest) {
  const startTime = performance.now();
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const body = await req.json();
    const name = String(body?.name || "").trim();
    const format = body?.format as TournamentFormat;
    const matchType = String(body?.matchType || "sealed");
    const maxPlayers = Number(body?.maxPlayers || 8);
    const isPrivate = Boolean(body?.isPrivate);
    // Accept sealed/draft config from either top-level or nested in `settings`
    const incomingSettings =
      (body?.settings as Record<string, unknown> | undefined) || {};
    let sealedConfig =
      (body?.sealedConfig as unknown) ??
      (incomingSettings?.sealedConfig as unknown) ??
      null;
    let draftConfig =
      (body?.draftConfig as unknown) ??
      (incomingSettings?.draftConfig as unknown) ??
      null;

    // Validate and normalize sealedConfig
    if (sealedConfig && typeof sealedConfig === "object") {
      const config = sealedConfig as Record<string, unknown>;
      // Validate timeLimit if provided
      if (config.timeLimit !== undefined && config.timeLimit !== null) {
        const timeLimit = Number(config.timeLimit);
        if (isNaN(timeLimit) || timeLimit < 10 || timeLimit > 90) {
          return new Response(
            JSON.stringify({
              error: "Sealed time limit must be between 10 and 90 minutes",
            }),
            { status: 400 }
          );
        }
        config.timeLimit = timeLimit;
      } else {
        // Default to 40 minutes if not provided
        config.timeLimit = 40;
      }
      sealedConfig = config;
    }

    // Validate and normalize draftConfig
    if (draftConfig && typeof draftConfig === "object") {
      const config = draftConfig as Record<string, unknown>;
      // Validate pickTimeLimit if provided
      if (config.pickTimeLimit !== undefined && config.pickTimeLimit !== null) {
        const pickTimeLimit = Number(config.pickTimeLimit);
        if (isNaN(pickTimeLimit) || pickTimeLimit < 30 || pickTimeLimit > 300) {
          return new Response(
            JSON.stringify({
              error: "Draft pick time limit must be between 30 and 300 seconds",
            }),
            { status: 400 }
          );
        }
        config.pickTimeLimit = pickTimeLimit;
      } else {
        // Default to 60 seconds if not provided
        config.pickTimeLimit = 60;
      }
      // Validate constructionTimeLimit if provided
      if (
        config.constructionTimeLimit !== undefined &&
        config.constructionTimeLimit !== null
      ) {
        const constructionTimeLimit = Number(config.constructionTimeLimit);
        if (
          isNaN(constructionTimeLimit) ||
          constructionTimeLimit < 10 ||
          constructionTimeLimit > 60
        ) {
          return new Response(
            JSON.stringify({
              error:
                "Draft construction time limit must be between 10 and 60 minutes",
            }),
            { status: 400 }
          );
        }
        config.constructionTimeLimit = constructionTimeLimit;
      } else {
        // Default to 20 minutes if not provided
        config.constructionTimeLimit = 20;
      }
      draftConfig = config;
    }

    console.log("Creating tournament:", {
      name,
      format,
      matchType,
      maxPlayers,
      isPrivate,
      creatorId: session.user.id,
    });

    if (!name) {
      return new Response(
        JSON.stringify({ error: "Missing tournament name" }),
        { status: 400 }
      );
    }

    if (!["sealed", "draft", "constructed"].includes(format)) {
      return new Response(
        JSON.stringify({ error: "Invalid tournament format" }),
        { status: 400 }
      );
    }

    if (![2, 4, 8, 16, 32].includes(maxPlayers)) {
      return new Response(
        JSON.stringify({ error: "Invalid max players count" }),
        { status: 400 }
      );
    }

    // Enforce "one lobby rule" - check if user is already in any active tournament
    const existingTournamentRegistrations =
      await prisma.tournamentRegistration.findMany({
        where: {
          playerId: session.user.id,
          tournament: {
            status: { in: ["registering", "preparing", "active"] },
          },
        },
        include: { tournament: { select: { name: true } } },
      });

    if (existingTournamentRegistrations.length > 0) {
      const tournamentName = existingTournamentRegistrations[0].tournament.name;
      return new Response(
        JSON.stringify({
          error: `You are already in tournament "${tournamentName}". Leave that tournament before creating a new one.`,
        }),
        { status: 400 }
      );
    }

    // Use client-provided totalRounds if available, otherwise default to 3 for Swiss
    // Swiss tournaments typically run 3-5 rounds regardless of player count
    const clientTotalRounds =
      typeof incomingSettings?.totalRounds === "number"
        ? incomingSettings.totalRounds
        : null;
    const totalRounds = clientTotalRounds ?? 3; // Default 3 rounds for Swiss

    // Merge provided arbitrary settings while enforcing server-calculated fields
    // Tournament pairing format is always Swiss
    const settingsOut: Record<string, unknown> = {
      ...incomingSettings,
      pairingFormat: "swiss",
      totalRounds,
      roundTimeLimit: 50,
      matchTimeLimit: 60,
      sealedConfig,
      draftConfig,
    };

    const tournament = await prisma.tournament.create({
      data: {
        name,
        creatorId: session.user.id,
        format,
        status: "registering",
        maxPlayers,
        isPrivate,
        // Ensure a Prisma-compatible JSON shape
        settings: JSON.parse(JSON.stringify(settingsOut)),
      },
    });

    // Auto-register the tournament creator
    console.log(
      "Starting auto-registration for tournament creator:",
      session.user.id
    );

    try {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true, email: true },
      });

      console.log("Found user for auto-registration:", user);

      const displayName =
        user?.name ||
        (user?.email ? user.email.split("@")[0] : null) ||
        "Tournament Host";

      console.log("Auto-registering with displayName:", displayName);

      await prisma.$transaction([
        prisma.tournamentRegistration.create({
          data: {
            tournamentId: tournament.id,
            playerId: session.user.id,
          },
        }),
        prisma.playerStanding.upsert({
          where: {
            tournamentId_playerId: {
              tournamentId: tournament.id,
              playerId: session.user.id,
            },
          },
          create: {
            tournamentId: tournament.id,
            playerId: session.user.id,
            displayName,
          },
          update: {
            displayName,
            isEliminated: false,
            currentMatchId: null,
          },
        }),
      ]);

      console.log("Tournament creator auto-registered successfully:", {
        tournamentId: tournament.id,
        creatorId: session.user.id,
      });
    } catch (autoRegError) {
      console.error("Error during auto-registration:", autoRegError);
      // Don't fail tournament creation if auto-registration fails
    }

    // Invalidate tournament list caches (new tournament was created)
    await invalidateCache(CacheKeys.tournaments.invalidateAll());

    // Broadcast new tournament so lobby/tournaments lists auto-update
    try {
      await tournamentSocketService.broadcastTournamentUpdateById(
        tournament.id
      );
    } catch (socketErr) {
      console.warn("Failed to broadcast tournament creation:", socketErr);
    }

    logPerformance("POST /api/tournaments", performance.now() - startTime);
    return new Response(
      JSON.stringify({
        id: tournament.id,
        name: tournament.name,
        creatorId: tournament.creatorId,
        format: tournament.format,
        status: tournament.status,
        maxPlayers: tournament.maxPlayers,
        isPrivate: tournament.isPrivate,
        settings: tournament.settings,
      }),
      {
        status: 201,
        headers: { "content-type": "application/json" },
      }
    );
  } catch (e: unknown) {
    console.error("Error creating tournament:", e);
    logPerformance("POST /api/tournaments", performance.now() - startTime);
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
        ? e
        : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
