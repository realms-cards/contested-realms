import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";
import type { AdminUserSummary } from "@/lib/admin/types";
import { prisma } from "@/lib/prisma";

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
        email: true,
        emailVerified: true,
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
    const [sessions, matchResults, registrations] = await Promise.all([
      prisma.session.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, expires: true },
        orderBy: { expires: "desc" },
      }),
      prisma.matchResult.findMany({
        where: {
          OR: [
            { winnerId: { in: userIds } },
            { loserId: { in: userIds } },
          ],
        },
        select: { winnerId: true, loserId: true },
      }),
      prisma.tournamentRegistration.findMany({
        where: { playerId: { in: userIds } },
        select: { playerId: true },
      }),
    ]);

    const lastSeenMap = new Map<string, string>();
    for (const session of sessions) {
      const expiresIso =
        session.expires instanceof Date
          ? session.expires.toISOString()
          : new Date(session.expires).toISOString();
      const previous = lastSeenMap.get(session.userId);
      if (!previous || previous < expiresIso) {
        lastSeenMap.set(session.userId, expiresIso);
      }
    }

    const matchCountMap = new Map<string, number>();
    for (const result of matchResults) {
      if (result.winnerId) {
        matchCountMap.set(
          result.winnerId,
          (matchCountMap.get(result.winnerId) || 0) + 1
        );
      }
      if (result.loserId) {
        matchCountMap.set(
          result.loserId,
          (matchCountMap.get(result.loserId) || 0) + 1
        );
      }
    }

    const registrationCountMap = new Map<string, number>();
    for (const reg of registrations) {
      registrationCountMap.set(
        reg.playerId,
        (registrationCountMap.get(reg.playerId) || 0) + 1
      );
    }

    const summaries: AdminUserSummary[] = users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.emailVerified?.toISOString() ?? null,
      lastSeenAt: lastSeenMap.get(user.id) ?? null,
      matchCount: matchCountMap.get(user.id) || 0,
      tournamentRegistrations: registrationCountMap.get(user.id) || 0,
    }));

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
