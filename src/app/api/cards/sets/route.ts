import { prisma } from "@/lib/prisma";

// ISR: Sets rarely change (only on new set releases ~2x/year), revalidate every week
export const revalidate = 604800; // 1 week

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

    return new Response(JSON.stringify(sets), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control":
          "public, max-age=604800, s-maxage=604800, stale-while-revalidate=2592000, immutable",
      },
    });
  } catch (e) {
    console.error("Sets API error:", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
