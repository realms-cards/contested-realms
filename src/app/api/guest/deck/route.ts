import { NextRequest, NextResponse } from "next/server";
import {
  formatValidationErrors,
  validateDeck,
} from "@/lib/deck/validation-rules";
import {
  buildDeckCardRefs,
  externalDeckFetchError,
  fetchExternalDeck,
  resolveExternalDeckRows,
} from "@/lib/decks/external-deck-resolver";

export const dynamic = "force-dynamic";

// POST /api/guest/deck { url }
// Resolves a Curiosa (sorcerytcg.com) or Four Cores deck URL straight into the
// card refs the game loader consumes (same shape as GET /api/decks/[id]),
// without persisting anything. This is how account-less players bring a deck
// to an invite-link match. No auth: the lists are public and nothing is stored.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawUrl = String(body?.url || "").trim();
    if (!rawUrl) {
      return NextResponse.json(
        { error: "Provide a sorcerytcg.com or Four Cores deck URL" },
        { status: 400 },
      );
    }

    const fetched = await fetchExternalDeck(rawUrl);
    if (!fetched) {
      return NextResponse.json(
        { error: externalDeckFetchError(rawUrl) },
        { status: 400 },
      );
    }

    const resolved = await resolveExternalDeckRows(fetched.deck);
    if (!resolved.ok) {
      return NextResponse.json(
        { error: resolved.error, unresolved: resolved.unresolved },
        { status: 400 },
      );
    }
    const { rows, avatarName, spellbookCount, atlasCount, collectionCount } =
      resolved.deck;

    // Invite matches are casual: apply the same lenient floor the game loader
    // uses for regular online play so precons and learning decks stay playable
    const validation = validateDeck(
      { spellbookCount, atlasCount, collectionCount, avatarCount: 1 },
      "limited",
      avatarName,
    );
    if (!validation.isValid) {
      return NextResponse.json(
        { error: formatValidationErrors(validation) },
        { status: 400 },
      );
    }

    const zones = await buildDeckCardRefs(rows);
    return NextResponse.json({
      name: fetched.deck.deckName || `${avatarName} deck`,
      source: fetched.source,
      sourceId: fetched.sourceId,
      ...zones,
      sideboard: [],
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
