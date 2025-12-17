import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";
import type { AdminUserSummary } from "@/lib/admin/types";
import { prisma } from "@/lib/prisma";

const VALID_PATRON_TIERS = ["apprentice", "grandmaster"] as const;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAdminSession();
    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(1, Math.floor(limitRaw)), MAX_LIMIT)
      : DEFAULT_LIMIT;
    const cursor = url.searchParams.get("cursor");
    const query = url.searchParams.get("q")?.trim();

    const where: Prisma.UserWhereInput | undefined =
      query && query.length > 1
        ? {
            OR: [
              {
                name: {
                  contains: query,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                email: {
                  contains: query,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              { id: query },
            ],
          }
        : undefined;

    const usersRaw = await prisma.user.findMany({
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      where,
      orderBy: { id: "desc" },
      select: {
        id: true,
        name: true,
        emailVerified: true,
        patronTier: true,
      },
    });

    let nextCursor: string | null = null;
    let users = usersRaw;
    if (usersRaw.length > limit) {
      const last = usersRaw.pop();
      if (last) nextCursor = last.id;
      users = usersRaw;
    }

    const userIds = users.map((u) => u.id);
    const [matchResults, registrations, decks, collectionCards, cardLists] =
      await Promise.all([
        prisma.matchResult.findMany({
          where: {
            OR: [{ winnerId: { in: userIds } }, { loserId: { in: userIds } }],
          },
          select: { winnerId: true, loserId: true, completedAt: true },
        }),
        prisma.tournamentRegistration.findMany({
          where: { playerId: { in: userIds } },
          select: { playerId: true },
        }),
        prisma.deck.findMany({
          where: { userId: { in: userIds } },
          select: { userId: true, createdAt: true, updatedAt: true },
        }),
        // Collection activity (solo/collection users)
        prisma.collectionCard.findMany({
          where: { userId: { in: userIds } },
          select: { userId: true, createdAt: true, updatedAt: true },
        }),
        // Card lists activity (wishlists, trade binders, etc.)
        prisma.cardList.findMany({
          where: { userId: { in: userIds } },
          select: { userId: true, createdAt: true, updatedAt: true },
        }),
      ]);

    // Track first and last activity dates per user
    const firstSeenMap = new Map<string, Date>();
    const lastSeenMap = new Map<string, Date>();
    const matchCountMap = new Map<string, number>();

    // Helper to update first/last seen
    const updateActivity = (userId: string, date: Date | null) => {
      if (!date) return;
      const first = firstSeenMap.get(userId);
      if (!first || date < first) firstSeenMap.set(userId, date);
      const last = lastSeenMap.get(userId);
      if (!last || date > last) lastSeenMap.set(userId, date);
    };

    // Process match results
    for (const result of matchResults) {
      const completedAt = result.completedAt
        ? new Date(result.completedAt)
        : null;
      if (result.winnerId) {
        matchCountMap.set(
          result.winnerId,
          (matchCountMap.get(result.winnerId) || 0) + 1
        );
        updateActivity(result.winnerId, completedAt);
      }
      if (result.loserId) {
        matchCountMap.set(
          result.loserId,
          (matchCountMap.get(result.loserId) || 0) + 1
        );
        updateActivity(result.loserId, completedAt);
      }
    }

    // Process deck activity
    for (const deck of decks) {
      updateActivity(deck.userId, new Date(deck.createdAt));
      if (deck.updatedAt) {
        updateActivity(deck.userId, new Date(deck.updatedAt));
      }
    }

    // Process collection activity (solo/collection users)
    for (const card of collectionCards) {
      updateActivity(card.userId, new Date(card.createdAt));
      if (card.updatedAt) {
        updateActivity(card.userId, new Date(card.updatedAt));
      }
    }

    // Process card list activity
    for (const list of cardLists) {
      updateActivity(list.userId, new Date(list.createdAt));
      if (list.updatedAt) {
        updateActivity(list.userId, new Date(list.updatedAt));
      }
    }

    const registrationCountMap = new Map<string, number>();
    for (const reg of registrations) {
      registrationCountMap.set(
        reg.playerId,
        (registrationCountMap.get(reg.playerId) || 0) + 1
      );
    }

    const summaries: AdminUserSummary[] = users.map((user) => {
      // Use emailVerified as primary, fall back to first activity
      const createdAt =
        user.emailVerified?.toISOString() ??
        firstSeenMap.get(user.id)?.toISOString() ??
        null;
      const lastSeenAt = lastSeenMap.get(user.id)?.toISOString() ?? null;
      return {
        id: user.id,
        name: user.name,
        createdAt,
        lastSeenAt,
        matchCount: matchCountMap.get(user.id) || 0,
        tournamentRegistrations: registrationCountMap.get(user.id) || 0,
        patronTier: user.patronTier,
      };
    });

    return NextResponse.json({
      users: summaries,
      nextCursor,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    console.error("[admin] users endpoint failed:", error);
    return NextResponse.json(
      { error: "Failed to load users" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    await requireAdminSession();
    const body = await request.json();
    const { userId, patronTier } = body as {
      userId?: string;
      patronTier?: string | null;
    };

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    // Validate patronTier
    if (
      patronTier !== null &&
      patronTier !== undefined &&
      !VALID_PATRON_TIERS.includes(
        patronTier as (typeof VALID_PATRON_TIERS)[number]
      )
    ) {
      return NextResponse.json(
        {
          error: `Invalid patronTier. Must be one of: ${VALID_PATRON_TIERS.join(
            ", "
          )} or null`,
        },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { patronTier: patronTier ?? null },
      select: { id: true, name: true, patronTier: true },
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    console.error("[admin] users PATCH failed:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}
