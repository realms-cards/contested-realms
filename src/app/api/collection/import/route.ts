import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { parseSorceryDeckText } from "@/lib/decks/parsers/sorcery-decktext";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/collection/import
// Body: { text: string, format: 'sorcery' | 'csv' }
// Parses deck-like text format and adds cards to collection
export async function POST(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  try {
    const userId = session.user.id;

    // Verify user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return new Response(
        JSON.stringify({
          error: "Your account could not be found in the database.",
          code: "USER_NOT_FOUND",
        }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    }

    const body = await req.json();
    const text = body?.text;
    const format = body?.format || "sorcery";

    if (!text || typeof text !== "string") {
      return new Response(
        JSON.stringify({ error: "No text provided", code: "INVALID_INPUT" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    type ImportedCard = {
      name: string;
      quantity: number;
      matched: boolean;
      cardId?: number;
    };
    const added: ImportedCard[] = [];
    const errors: Array<{ name: string; message: string }> = [];

    if (format === "sorcery") {
      // Use the existing sorcery deck text parser
      const parsed = parseSorceryDeckText(text);

      // Flatten all categories into a list of names with counts
      const cardList: Array<{ name: string; count: number }> = [];
      for (const cat of Object.values(parsed.categories)) {
        for (const item of cat) {
          cardList.push({ name: item.name, count: item.count });
        }
      }

      // Look up cards by name
      const cardNames = [...new Set(cardList.map((c) => c.name))];
      const cards = await prisma.card.findMany({
        where: {
          name: { in: cardNames, mode: "insensitive" },
        },
        select: { id: true, name: true },
      });

      // Build name -> card mapping (case-insensitive)
      const cardByName = new Map<string, { id: number; name: string }>();
      for (const card of cards) {
        cardByName.set(card.name.toLowerCase(), card);
      }

      // Process each card
      for (const item of cardList) {
        const card = cardByName.get(item.name.toLowerCase());

        if (!card) {
          errors.push({ name: item.name, message: "Card not found" });
          added.push({ name: item.name, quantity: item.count, matched: false });
          continue;
        }

        // Upsert into collection
        const existing = await prisma.collectionCard.findFirst({
          where: {
            userId,
            cardId: card.id,
            finish: "Standard",
          },
        });

        if (existing) {
          const newQuantity = Math.min(99, existing.quantity + item.count);
          await prisma.collectionCard.update({
            where: { id: existing.id },
            data: { quantity: newQuantity },
          });
        } else {
          await prisma.collectionCard.create({
            data: {
              userId,
              cardId: card.id,
              finish: "Standard",
              quantity: Math.min(99, item.count),
            },
          });
        }

        added.push({
          name: item.name,
          quantity: item.count,
          matched: true,
          cardId: card.id,
        });
      }
    } else if (format === "csv") {
      // Simple CSV format: "quantity,name" per line
      // Optimized: Batch all lookups and upserts instead of sequential queries
      const lines = text.split(/[\r\n]+/).filter((l: string) => l.trim());

      // Parse all lines first
      const parsedLines: Array<{ name: string; count: number }> = [];
      for (const line of lines) {
        // Skip header line if present
        if (
          line.toLowerCase().includes("quantity") &&
          line.toLowerCase().includes("name")
        ) {
          continue;
        }

        // Parse CSV line: could be "4,Apprentice Wizard" or "4 Apprentice Wizard"
        const match = line.match(/^(\d+)[,\s]+(.+)$/);
        if (!match) {
          errors.push({ name: line, message: "Could not parse line" });
          continue;
        }

        const count = parseInt(match[1], 10);
        const name = match[2].trim().replace(/^["']|["']$/g, ""); // Remove quotes
        parsedLines.push({ name, count });
      }

      // Batch lookup all card names at once (1 query instead of N)
      const cardNames = parsedLines.map(p => p.name);
      const cards = await prisma.card.findMany({
        where: {
          name: {
            in: cardNames,
            mode: "insensitive",
          },
        },
        select: { id: true, name: true },
      });

      // Create lookup map (case-insensitive)
      const cardByName = new Map(
        cards.map(c => [c.name.toLowerCase(), c])
      );

      // Match parsed lines to cards
      const matchedCards: Array<{ cardId: number; name: string; count: number }> = [];
      for (const line of parsedLines) {
        const card = cardByName.get(line.name.toLowerCase());
        if (!card) {
          errors.push({ name: line.name, message: "Card not found" });
          added.push({ name: line.name, quantity: line.count, matched: false });
          continue;
        }
        matchedCards.push({ cardId: card.id, name: card.name, count: line.count });
      }

      // Batch check existing collection cards (1 query instead of N)
      const cardIds = matchedCards.map(m => m.cardId);
      const existingCards = await prisma.collectionCard.findMany({
        where: {
          userId,
          cardId: { in: cardIds },
          finish: "Standard",
        },
        select: { id: true, cardId: true, quantity: true },
      });

      const existingByCardId = new Map(
        existingCards.map(e => [e.cardId, e])
      );

      // Batch upsert operations
      const updateOps = [];
      const createOps = [];

      for (const match of matchedCards) {
        const existing = existingByCardId.get(match.cardId);
        if (existing) {
          const newQuantity = Math.min(99, existing.quantity + match.count);
          updateOps.push(
            prisma.collectionCard.update({
              where: { id: existing.id },
              data: { quantity: newQuantity },
            })
          );
        } else {
          createOps.push(
            prisma.collectionCard.create({
              data: {
                userId,
                cardId: match.cardId,
                finish: "Standard",
                quantity: Math.min(99, match.count),
              },
            })
          );
        }
        added.push({ name: match.name, quantity: match.count, matched: true, cardId: match.cardId });
      }

      // Execute all upserts in a single transaction (1 transaction instead of N queries)
      if (updateOps.length > 0 || createOps.length > 0) {
        await prisma.$transaction([...updateOps, ...createOps]);
      }
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid format", code: "INVALID_FORMAT" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const imported = added
      .filter((a) => a.matched)
      .reduce((sum, a) => sum + a.quantity, 0);

    return new Response(JSON.stringify({ imported, added, errors }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message, code: "PARSE_ERROR" }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      }
    );
  }
}
