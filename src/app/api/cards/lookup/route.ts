import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/cards/lookup - Look up cards by name
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
    const { names } = body;

    if (!Array.isArray(names) || names.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Names array is required",
          code: "INVALID_INPUT",
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // Limit to 100 names per request
    const limitedNames = names.slice(0, 100);

    const cards = await prisma.card.findMany({
      where: {
        name: { in: limitedNames, mode: "insensitive" },
      },
      include: {
        variants: {
          take: 1,
          select: {
            id: true,
            setId: true,
            slug: true,
          },
        },
      },
    });

    const result = cards.map((card) => ({
      id: card.id,
      name: card.name,
      variantId: card.variants[0]?.id ?? null,
      setId: card.variants[0]?.setId ?? null,
      slug: card.variants[0]?.slug ?? null,
    }));

    return new Response(JSON.stringify({ cards: result }), {
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
