import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { withCache, CacheKeys } from "@/lib/cache/redis-cache";
import { logPerformance } from "@/lib/monitoring/performance";
import { prisma } from "@/lib/prisma";
import { countActiveSeats } from "@/lib/tournament/registration";

export const dynamic = "force-dynamic";

// GET /api/tournaments/[id]
// Returns specific tournament details
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = performance.now();
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const userId = session.user.id;

    // Cache tournament detail with user-specific viewerDeck
    const cacheKey = CacheKeys.tournaments.detail(id) + `:user:${userId}`;

    const tournamentInfo = await withCache(
      cacheKey,
      async () => {
        const tournament = await prisma.tournament.findUnique({
          where: { id },
          include: {
            registrations: {
              include: {
                player: {
                  select: { id: true, name: true },
                },
              },
            },
            standings: true,
            rounds: {
              include: {
                matches: { select: { id: true } },
              },
              orderBy: { roundNumber: "asc" },
            },
          },
        });

        if (!tournament) {
          throw new Error("Tournament not found");
        }

        // Build viewer deck if available
        const viewerId: string | null = userId ?? null;
        const viewerReg = viewerId
          ? tournament.registrations.find((r) => r.playerId === viewerId) ||
            null
          : null;
        let viewerDeck: Array<{ cardId: string; quantity: number }> | null =
          null;
        if (viewerReg && viewerReg.preparationData) {
          try {
            const prep = viewerReg.preparationData as unknown as Record<
              string,
              unknown
            >;
            const sealed = prep?.sealed as
              | { deckList?: Array<{ cardId: string; quantity: number }> }
              | undefined;
            const draft = prep?.draft as
              | { deckList?: Array<{ cardId: string; quantity: number }> }
              | undefined;
            const constructed = prep?.constructed as
              | {
                  deckId?: string;
                  deckList?: Array<{ cardId: string; quantity: number }>;
                }
              | undefined;

            // Prefer explicit deck lists when available (sealed/draft/constructed)
            const list =
              sealed?.deckList ||
              draft?.deckList ||
              constructed?.deckList ||
              null;
            if (Array.isArray(list)) {
              viewerDeck = list.map((it) => ({
                cardId: String(it.cardId),
                quantity: Number(it.quantity) || 0,
              }));
            }

            // Fallback for constructed: fetch the selected deck from database and aggregate
            if (!viewerDeck && constructed?.deckId) {
              const deck = await prisma.deck.findUnique({
                where: { id: constructed.deckId },
                include: { cards: true },
              });
              if (deck) {
                // Aggregate cards by cardId
                const cardMap = new Map<string, number>();
                for (const card of deck.cards) {
                  const id = String(card.cardId);
                  cardMap.set(id, (cardMap.get(id) || 0) + (card.count || 1));
                }
                viewerDeck = Array.from(cardMap.entries()).map(
                  ([cardId, quantity]) => ({ cardId, quantity })
                );
              }
            }
          } catch {}
        }

        // Transform to match protocol format
        return {
          id: tournament.id,
          name: tournament.name,
          format: tournament.format,
          status: tournament.status,
          maxPlayers: tournament.maxPlayers,
          currentPlayers: countActiveSeats(tournament.registrations),
          creatorId: tournament.creatorId,
          registeredPlayers: tournament.registrations.map((reg) => {
            const prep =
              (reg.preparationData as Record<string, unknown> | null) || {};
            return {
              id: reg.playerId,
              displayName: reg.player.name || "Anonymous",
              ready: Boolean((prep as { ready?: boolean }).ready),
              deckSubmitted: Boolean(reg.deckSubmitted),
              seatStatus: reg.seatStatus,
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
          currentRound:
            tournament.rounds.length > 0
              ? Math.max(...tournament.rounds.map((r) => r.roundNumber))
              : 0,
          totalRounds: 0, // Will be calculated based on player count and format
          rounds: tournament.rounds.map((round) => ({
            roundNumber: round.roundNumber,
            status: round.status,
            matches: round.matches.map((match) => match.id),
          })),
          settings: tournament.settings,
          viewerDeck,
          createdAt:
            typeof tournament.createdAt === "string"
              ? new Date(tournament.createdAt).getTime()
              : tournament.createdAt.getTime(),
        };
      },
      { ttl: 5 } // 5 second cache - tournament state changes frequently during active play
    );

    logPerformance(`GET /api/tournaments/${id}`, performance.now() - startTime);
    return new Response(JSON.stringify(tournamentInfo), {
      status: 200,
      headers: {
        "content-type": "application/json",
        // Short-lived private cache to reduce DB load during bursts
        "Cache-Control": "private, max-age=3",
      },
    });
  } catch (e: unknown) {
    logPerformance(`GET /api/tournaments/${id}`, performance.now() - startTime);
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
        ? e
        : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

// DELETE /api/tournaments/[id]
// Delete tournament (only if registering and empty)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = performance.now();
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: { registrations: true },
    });

    if (!tournament) {
      return new Response(JSON.stringify({ error: "Tournament not found" }), {
        status: 404,
      });
    }

    if (tournament.status !== "registering") {
      return new Response(
        JSON.stringify({ error: "Cannot delete tournament in progress" }),
        { status: 400 }
      );
    }

    if (tournament.registrations.length > 0) {
      return new Response(
        JSON.stringify({
          error: "Cannot delete tournament with registered players",
        }),
        { status: 400 }
      );
    }

    await prisma.tournament.delete({
      where: { id },
    });

    logPerformance(
      `DELETE /api/tournaments/${id}`,
      performance.now() - startTime
    );
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: unknown) {
    logPerformance(
      `DELETE /api/tournaments/${id}`,
      performance.now() - startTime
    );
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
        ? e
        : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
