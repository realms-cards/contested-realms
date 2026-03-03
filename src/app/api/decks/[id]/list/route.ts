import { NextRequest } from "next/server";
import { buildCuriosaCompatDeckList } from "@/lib/decks/curiosa-compat";

export const dynamic = "force-dynamic";

/**
 * GET /api/decks/[id]/list
 *
 * Public endpoint returning deck data in the same shape as Curiosa's tRPC API.
 * This allows consumers (e.g. Sorcerers Summit) that already parse Curiosa
 * deck data to ingest realms.cards decks without any code changes.
 *
 * See CuriosaCompatDeckList in @/lib/decks/curiosa-compat for response shape.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return Response.json({ error: "Missing id" }, { status: 400 });
    }

    const result = await buildCuriosaCompatDeckList(id);

    if (!result) {
      return Response.json({ error: "Deck not found" }, { status: 404 });
    }

    return Response.json(result, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
