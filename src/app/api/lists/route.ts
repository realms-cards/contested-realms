import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/lists - Get all lists for current user
export async function GET(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  try {
    const userId = session.user.id;
    const { searchParams } = new URL(req.url);
    const includePublic = searchParams.get("includePublic") === "true";

    const where = includePublic
      ? {
          OR: [{ userId }, { isPublic: true }],
        }
      : { userId };

    const lists = await prisma.cardList.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { cards: true } },
        cards: {
          take: 1,
          include: {
            variant: { select: { slug: true } },
            card: { select: { name: true } },
          },
        },
        user: { select: { name: true } },
      },
    });

    const response = lists.map((list: (typeof lists)[number]) => ({
      id: list.id,
      name: list.name,
      description: list.description,
      isPublic: list.isPublic,
      isOwner: list.userId === userId,
      cardCount: list._count.cards,
      previewCard: list.cards[0]
        ? {
            name: list.cards[0].card.name,
            slug: list.cards[0].variant?.slug,
          }
        : null,
      ownerName: list.user?.name,
      createdAt: list.createdAt.toISOString(),
      updatedAt: list.updatedAt.toISOString(),
    }));

    return new Response(JSON.stringify({ lists: response }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

// POST /api/lists - Create a new list
export async function POST(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const { name, description, isPublic } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Name is required", code: "INVALID_INPUT" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    if (name.trim().length > 100) {
      return new Response(
        JSON.stringify({
          error: "Name must be 100 characters or less",
          code: "INVALID_INPUT",
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true },
    });

    if (!user) {
      return new Response(
        JSON.stringify({
          error:
            "Your account could not be found in the database. Please sign out and sign back in.",
          code: "USER_NOT_FOUND",
        }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    }

    const list = await prisma.cardList.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        isPublic: Boolean(isPublic),
        userId: session.user.id,
      },
    });

    return new Response(
      JSON.stringify({
        id: list.id,
        name: list.name,
        description: list.description,
        isPublic: list.isPublic,
      }),
      { status: 201, headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
