import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { normalizeCubeSummary } from "@/lib/cubes/normalizers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type ApiCubeCard = {
  cardId: number;
  variantId: number | null;
  setId: number | null;
  count: number;
  name: string;
  slug: string | null;
  setName: string | null;
  type: string | null;
  rarity: string | null;
  zone: string | null;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const { id } = await params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Missing id" }), {
        status: 400,
      });
    }

    const cube = await prisma.cube.findUnique({
      where: { id },
      include: {
        cards: {
          include: {
            card: { select: { name: true } },
            variant: { select: { slug: true, typeText: true } },
            set: { select: { name: true } },
          },
        },
        user: { select: { name: true } },
      },
    });

    if (!cube || (cube.userId !== session.user.id && !cube.isPublic)) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
      });
    }

    const cardIdsWithSet = cube.cards
      .map((c) =>
        c.setId == null ? null : { cardId: c.cardId, setId: c.setId }
      )
      .filter(
        (value): value is { cardId: number; setId: number } => value !== null
      );

    const metaMap = new Map<
      string,
      { type: string | null; rarity: string | null }
    >();
    if (cardIdsWithSet.length) {
      const metas = await prisma.cardSetMetadata.findMany({
        where: { OR: cardIdsWithSet },
        select: { cardId: true, setId: true, type: true, rarity: true },
      });
      for (const meta of metas) {
        metaMap.set(`${meta.cardId}:${meta.setId}`, {
          type: meta.type ?? null,
          rarity: meta.rarity ?? null,
        });
      }
    }

    const cards: ApiCubeCard[] = cube.cards.map((entry) => {
      const key = entry.setId ? `${entry.cardId}:${entry.setId}` : null;
      const meta = key ? metaMap.get(key) : null;
      const zoneValue =
        (entry as unknown as { zone?: string | null }).zone ?? "main";
      return {
        cardId: entry.cardId,
        variantId: entry.variantId ?? null,
        setId: entry.setId ?? null,
        count: entry.count,
        name: entry.card?.name ?? "",
        slug: entry.variant?.slug ?? null,
        setName: entry.set?.name ?? null,
        type: entry.variant?.typeText ?? meta?.type ?? null,
        rarity: meta?.rarity ?? null,
        zone: zoneValue,
      };
    });

    const summary = normalizeCubeSummary(cube, {
      isOwner: cube.userId === session.user.id,
      userName: cube.user?.name || "Unknown Player",
    });

    return new Response(
      JSON.stringify({
        ...summary,
        cards,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const { id } = await params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Missing id" }), {
        status: 400,
      });
    }

    const cube = await prisma.cube.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!cube) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
      });
    }

    await prisma.cube.delete({ where: { id } });
    return new Response(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const { id } = await params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Missing id" }), {
        status: 400,
      });
    }

    const cube = await prisma.cube.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!cube) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
      });
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const name = body?.name ? String(body.name).trim() : undefined;
    const description = body?.description
      ? String(body.description).trim()
      : undefined;
    const isPublic =
      body?.isPublic !== undefined ? Boolean(body.isPublic) : undefined;
    const cards = Array.isArray(body?.cards)
      ? (body.cards as Array<Record<string, unknown>>)
      : [];

    const updated = await prisma.cube.update({
      where: { id },
      data: {
        name,
        description,
        isPublic,
      },
      include: { cards: { select: { id: true } } },
    });

    if (cards.length) {
      await prisma.$transaction([
        prisma.cubeCard.deleteMany({ where: { cubeId: id } }),
        prisma.cubeCard.createMany({
          data: cards
            .map((card) => {
              const cardId = Number(card.cardId ?? card["cardId"] ?? 0);
              const count = Number(card.count ?? card["count"] ?? 0);
              if (!Number.isFinite(cardId) || cardId <= 0) return null;
              const safeCount =
                Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
              if (safeCount <= 0) return null;
              const setIdRaw = card.setId ?? card["setId"];
              const variantIdRaw = card.variantId ?? card["variantId"];
              return {
                cubeId: id,
                cardId,
                setId: setIdRaw == null ? null : Number(setIdRaw) || null,
                variantId:
                  variantIdRaw == null ? null : Number(variantIdRaw) || null,
                count: safeCount,
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
              } => !!row
            ),
        }),
      ]);
    }

    return new Response(JSON.stringify({ id: updated.id }), { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
