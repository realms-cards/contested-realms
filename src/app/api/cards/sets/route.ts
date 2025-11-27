import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/cards/sets
// Returns all available sets for filtering
export async function GET() {
  try {
    const sets = await prisma.set.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: "asc" },
    });

    return Response.json(sets);
  } catch (e) {
    console.error("Sets API error:", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
