import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import {
  normalizeCubeSummary,
  type CubeSummaryInput,
} from "@/lib/cubes/normalizers";
import type { CubeSummary } from "@/lib/cubes/types";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const userId = session.user.id;

    const [myCubes, publicCubes] = await Promise.all([
      prisma.cube.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        include: { cards: { select: { count: true } } },
      }),
      prisma.cube.findMany({
        where: { isPublic: true, userId: { not: userId } },
        orderBy: { updatedAt: "desc" },
        take: 50,
        include: {
          cards: { select: { count: true } },
          user: { select: { name: true } },
        },
      }),
    ]);

    const mapOwnerCube = (cube: CubeSummaryInput): CubeSummary =>
      normalizeCubeSummary(cube, { isOwner: true });

    const mapPublicCube = (
      cube: CubeSummaryInput & { user?: { name?: string | null } | null }
    ): CubeSummary =>
      normalizeCubeSummary(cube, {
        isOwner: false,
        userName: cube.user?.name || "Unknown Player",
      });

    const response = {
      myCubes: myCubes.map((cube) => mapOwnerCube(cube)),
      publicCubes: publicCubes.map((cube) => mapPublicCube(cube)),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });
    if (!user) {
      return new Response(
        JSON.stringify({
          error:
            "Your account could not be found in the database. If you already have a user account, please sign out, clear your browser cookies and sign back in",
        }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const name = body?.name ? String(body.name).trim() : "Untitled Cube";
    const description = body?.description
      ? String(body.description).trim()
      : null;
    const isPublic = Boolean(body?.isPublic);
    const imported = Boolean(body?.imported);
    const cards = Array.isArray(body?.cards)
      ? (body.cards as Array<Record<string, unknown>>)
      : [];

    const cube = await prisma.cube.create({
      data: {
        name: name || "Untitled Cube",
        description,
        isPublic,
        imported,
        userId: session.user.id,
      },
    });

    if (cards.length) {
      const cardRows = cards
        .map((card) => {
          const cardId = Number(card.cardId ?? card["cardId"] ?? 0);
          const count = Number(card.count ?? card["count"] ?? 0);
          if (!Number.isFinite(cardId) || cardId <= 0) return null;
          const safeCount =
            Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
          if (safeCount <= 0) return null;
          const setIdRaw = card.setId ?? card["setId"];
          const variantIdRaw = card.variantId ?? card["variantId"];
          const zoneRaw =
            (card as { zone?: unknown }).zone ??
            (card as Record<string, unknown>)["zone"];
          const zone =
            typeof zoneRaw === "string" && zoneRaw.toLowerCase() === "sideboard"
              ? "sideboard"
              : "main";
          return {
            cubeId: cube.id,
            cardId,
            setId: setIdRaw == null ? null : Number(setIdRaw) || null,
            variantId:
              variantIdRaw == null ? null : Number(variantIdRaw) || null,
            count: safeCount,
            zone,
          };
        })
        .filter(
          (
            row
          ): row is {
            cubeId: string;
            cardId: number;
            setId: number | null;
            variantId: number | null;
            count: number;
            zone: string;
          } => !!row
        );

      if (cardRows.length) {
        await prisma.cubeCard.createMany({ data: cardRows });
      }
    }

    const created = await prisma.cube.findUnique({
      where: { id: cube.id },
      include: { cards: { select: { count: true } } },
    });

    const summary = normalizeCubeSummary(
      created ?? (cube as CubeSummaryInput),
      { isOwner: true }
    );

    return new Response(JSON.stringify(summary), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
