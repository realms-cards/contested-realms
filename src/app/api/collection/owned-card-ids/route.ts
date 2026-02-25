import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/collection/owned-card-ids
// Returns a compact list of cardIds the user owns (for filtering in deck editor)
export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  try {
    const ownedCards = await prisma.collectionCard.findMany({
      where: { userId: session.user.id },
      select: { cardId: true },
      distinct: ["cardId"],
    });

    return NextResponse.json({
      cardIds: ownedCards.map((c) => c.cardId),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
