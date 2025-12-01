import { NextRequest } from "next/server";
export const dynamic = "force-dynamic";
import { getSetIdByName } from "@/lib/api/cached-lookups";
import { prisma } from "@/lib/prisma";

// GET /api/cards/meta?set=Alpha&ids=1,2,3
// Returns: [{ cardId, cost, thresholds }]
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const setName = (searchParams.get("set") || "").trim();
    const idsParam = (searchParams.get("ids") || "").trim();

    if (!idsParam) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    let set: { id: number } | null = null;
    if (setName) {
      const setId = await getSetIdByName(setName);
      if (setId === null) {
        return new Response(
          JSON.stringify({ error: `Unknown set: ${setName}` }),
          { status: 400 }
        );
      }
      set = { id: setId };
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
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    let rows: Array<{
      cardId: number;
      cost: number | null;
      thresholds: unknown;
      attack: number | null;
      defence: number | null;
      type: string | null;
      setId: number;
    }>;
    if (set) {
      rows = await prisma.cardSetMetadata.findMany({
        where: { setId: set.id, cardId: { in: ids } },
        select: {
          cardId: true,
          cost: true,
          thresholds: true,
          attack: true,
          defence: true,
          type: true,
          setId: true,
        },
      });
    } else {
      // No set specified: fetch from all sets and pick the most recent per cardId
      rows = await prisma.cardSetMetadata.findMany({
        where: { cardId: { in: ids } },
        select: {
          cardId: true,
          cost: true,
          thresholds: true,
          attack: true,
          defence: true,
          type: true,
          setId: true,
        },
        orderBy: { setId: "desc" },
      });
      // Reduce to one row per cardId (highest setId wins)
      const bestByCard = new Map<number, (typeof rows)[number]>();
      for (const r of rows) {
        if (!bestByCard.has(r.cardId)) bestByCard.set(r.cardId, r);
      }
      rows = Array.from(bestByCard.values());
    }

    const out = rows.map((m) => ({
      cardId: m.cardId,
      cost: m.cost ?? null,
      thresholds:
        (m.thresholds as unknown as Record<string, number> | null) ?? null,
      attack: m.attack ?? null,
      defence: m.defence ?? null,
      type: m.type ?? null,
    }));

    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: unknown) {
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
        ? e
        : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
