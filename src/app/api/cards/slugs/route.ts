import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/cards/slugs
 * Returns all card variant slugs for offline caching.
 * Query params:
 *   - set: Filter by set name (optional)
 * Response: { slugs: string[], count: number }
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const setName = url.searchParams.get("set");

    const where = setName
      ? { set: { name: { equals: setName, mode: "insensitive" as const } } }
      : {};

    const variants = await prisma.variant.findMany({
      where,
      select: { slug: true },
      orderBy: { slug: "asc" },
    });

    const slugs = variants.map((v) => v.slug);

    return new Response(
      JSON.stringify({
        slugs,
        count: slugs.length,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          // Allow caching for 1 hour
          "Cache-Control": "public, max-age=3600",
        },
      }
    );
  } catch (error) {
    console.error("[API cards/slugs] Error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch card slugs" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
