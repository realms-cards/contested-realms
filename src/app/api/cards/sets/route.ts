import { prisma } from "@/lib/prisma";

// ISR: Sets rarely change (only on ingestion), revalidate every hour
export const revalidate = 3600; // 1 hour

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
