import { NextRequest } from "next/server";
import { withCache } from "@/lib/cache/redis-cache";
import { deckAvatarSummaries } from "@/lib/decks/avatarSummary.server";
import type { PublicDeckListEntry } from "@/lib/decks/deckCategories";
import { getRequestPrincipal } from "@/lib/guest/request-principal.server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** The system account that owns the precons; those are listed by GET /api/decks instead. */
const PRECON_OWNER_EMAIL = "public-decks@system.local";
const LIMIT = 60;

// GET /api/decks/public?q=<name filter>
// Other players' decks they marked public — newest first, without the precons (GET /api/decks)
// and without the viewer's own (already in their deck list). Fetched lazily: the deck pickers and
// the decks page only ask for it when that section is opened. A public deck loads like any other
// through GET /api/decks/[id], which serves public decks to everyone.
export async function GET(req: NextRequest) {
  const principal = await getRequestPrincipal();
  const viewerId = principal?.id ?? null;
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  try {
    const decks = await withCache<PublicDeckListEntry[]>(
      `decks:public:${viewerId ?? "anon"}:${q.toLowerCase()}`,
      async () => {
        const rows = await prisma.deck.findMany({
          where: {
            isPublic: true,
            user: { email: { not: PRECON_OWNER_EMAIL }, isGuest: false },
            ...(viewerId ? { userId: { not: viewerId } } : {}),
            ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
          },
          orderBy: { updatedAt: "desc" },
          take: LIMIT,
          select: { id: true, name: true, format: true, updatedAt: true, user: { select: { name: true } } },
        });
        const avatars = await deckAvatarSummaries(rows.map((d) => d.id));
        return rows.map((d) => {
          const avatar = avatars.get(d.id);
          return {
            id: d.id,
            name: d.name,
            format: d.format,
            userName: d.user.name || "Unknown Player",
            updatedAt: d.updatedAt.toISOString(),
            avatarState: avatar?.state ?? "none",
            avatarCard: avatar?.avatarCard ?? null,
          };
        });
      },
      { ttl: 60 },
    );
    return Response.json({ decks });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
