import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { invalidateCache, CacheKeys } from "@/lib/cache/redis-cache";
import {
  formatValidationErrors,
  resolveImportFormat,
} from "@/lib/deck/validation-rules";
import {
  aggregateDeckRows,
  externalDeckFetchError,
  fetchExternalDeck,
  resolveExternalDeckRows,
} from "@/lib/decks/external-deck-resolver";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function jsonError(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// POST /api/decks/import/curiosa
// Body: { url: string, name?: string, format?: string }
// - Accepts a Curiosa (sorcerytcg.com) or Four Cores (fourcores.xyz) deck URL
// - Fetches the structured decklist, maps printings to our variants, creates the deck
// - Validates avatar/site/spellbook counts similar to game loader expectations
export async function POST(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return jsonError({ error: "Unauthorized" }, 401);
  }
  try {
    // Ensure the authenticated user exists in the database (useful after local DB resets)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });
    if (!user) {
      return jsonError(
        {
          error:
            "Your account could not be found in the database. If you already have a user account, please sign out, clear your browser cookies and sign back in",
        },
        401,
      );
    }

    // Feature toggle: disable deck URL import globally unless explicitly enabled
    if (process.env.NEXT_PUBLIC_ENABLE_CURIOSA_IMPORT !== "true") {
      return jsonError({ error: "Deck import is disabled" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const rawUrl = String(body?.url || "").trim();
    const overrideName = body?.name ? String(body.name).trim() : "";
    // Optional: force a format instead of inferring it from the decklist
    const requestedFormat = body?.format ? String(body.format).trim() : null;

    if (!rawUrl) {
      return jsonError(
        {
          error: "Provide a Curiosa (sorcerytcg.com) or Four Cores deck URL",
        },
        400,
      );
    }

    const fetched = await fetchExternalDeck(rawUrl);
    if (!fetched) {
      return jsonError({ error: externalDeckFetchError(rawUrl) }, 400);
    }

    const resolved = await resolveExternalDeckRows(fetched.deck);
    if (!resolved.ok) {
      return jsonError(
        { error: resolved.error, unresolved: resolved.unresolved },
        400,
      );
    }
    const { rows, avatarName, spellbookCount, atlasCount } = resolved.deck;

    const finalName =
      overrideName ||
      fetched.deck.deckName ||
      (fetched.source === "curiosa"
        ? `Curiosa Import ${fetched.sourceId}`
        : `Four Cores Import ${fetched.sourceId ?? "Deck"}`);

    // Store the format the list actually qualifies for so a later edit or
    // publish doesn't fail a gate the import never applied
    const resolvedFormat = resolveImportFormat(
      { spellbookCount, atlasCount, avatarCount: 1 },
      avatarName,
      requestedFormat,
    );
    if (!resolvedFormat.validation.isValid) {
      return jsonError(
        { error: formatValidationErrors(resolvedFormat.validation) },
        400,
      );
    }

    const deck = await prisma.deck.create({
      data: {
        name: finalName,
        format: resolvedFormat.label,
        imported: true,
        // Sync only supports Curiosa, so Four Cores imports leave this unset
        curiosaSourceId: fetched.source === "curiosa" ? fetched.sourceId : null,
        user: { connect: { id: session.user.id } },
      },
    });

    const createRows = aggregateDeckRows(rows).map((v) => ({
      deckId: deck.id,
      cardId: v.cardId,
      setId: v.setId,
      variantId: v.variantId,
      zone: v.zone,
      count: v.count,
    }));
    if (createRows.length) {
      await prisma.deckCard.createMany({ data: createRows });
    }

    // Invalidate deck list cache for this user
    await invalidateCache(CacheKeys.decks.list(session.user.id));
    return new Response(
      JSON.stringify({ id: deck.id, name: deck.name, format: deck.format }),
      { status: 201, headers: { "content-type": "application/json" } },
    );
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
