import { NextRequest } from "next/server";
export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";

// GET /api/cards/meta?set=Alpha&ids=1,2,3
// Returns: [{ cardId, cost, thresholds }]
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const setName = (searchParams.get("set") || "").trim();
    const idsParam = (searchParams.get("ids") || "").trim();

    if (!idsParam) {
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    }

    if (!setName) {
      return new Response(JSON.stringify({ error: "Missing set" }), { status: 400 });
    }

    const set = await prisma.set.findUnique({ where: { name: setName } });
    if (!set) {
      return new Response(JSON.stringify({ error: `Unknown set: ${setName}` }), { status: 400 });
    }

    const ids = Array.from(
      new Set(
        idsParam
          .split(",")
          .map((s) => Number(s))
          .filter((n) => Number.isFinite(n) && n > 0)
      )
    );

    if (!ids.length) {
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    }

    const metas = await prisma.cardSetMetadata.findMany({
      where: { setId: set.id, cardId: { in: ids } },
      select: { cardId: true, cost: true, thresholds: true, attack: true, defence: true },
    });

    const out = metas.map((m) => ({
      cardId: m.cardId,
      cost: m.cost ?? null,
      thresholds: (m.thresholds as unknown as Record<string, number> | null) ?? null,
      attack: m.attack ?? null,
      defence: m.defence ?? null,
    }));

    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
