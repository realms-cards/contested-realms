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
      { status: 401, headers: { "content-type": "application/json" } },
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
        { status: 401, headers: { "content-type": "application/json" } },
      );
    }

    const body = await req.json();
    const text = body?.text;
    const format = body?.format || "sorcery";
    const skipExisting = body?.skipExisting === true;

    if (!text || typeof text !== "string") {
      return new Response(
        JSON.stringify({ error: "No text provided", code: "INVALID_INPUT" }),
        { status: 400, headers: { "content-type": "application/json" } },
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

      // Look up cards by name with their variants
      const cardNames = [...new Set(cardList.map((c) => c.name))];
      const cards = await prisma.card.findMany({
        where: {
          name: { in: cardNames, mode: "insensitive" },
        },
        select: {
          id: true,
          name: true,
          variants: {
            select: {
              id: true,
              setId: true,
              slug: true,
            },
            take: 1, // Just grab the first available variant
          },
        },
      });

      // Build name -> card mapping (case-insensitive)
      const cardByName = new Map<
        string,
        {
          id: number;
          name: string;
          variants: Array<{ id: number; setId: number | null; slug: string }>;
        }
      >();
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

        // Get variant info (first available variant for this card)
        const variant = card.variants?.[0];
        const variantId = variant?.id ?? null;
        const setId = variant?.setId ?? null;

        // Upsert into collection
        const existing = await prisma.collectionCard.findFirst({
          where: {
            userId,
            cardId: card.id,
            finish: "Standard",
          },
        });

        if (existing) {
          // Skip if user wants to only add new cards
          if (skipExisting) {
            continue;
          }
          const newQuantity = Math.min(99, existing.quantity + item.count);
          await prisma.collectionCard.update({
            where: { id: existing.id },
            data: {
              quantity: newQuantity,
              // Also update variant/set if missing
              variantId: existing.variantId ?? variantId,
              setId: existing.setId ?? setId,
            },
          });
        } else {
          await prisma.collectionCard.create({
            data: {
              userId,
              cardId: card.id,
              variantId,
              setId,
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
    } else if (format === "curiosa") {
      // Curiosa Collection CSV format: card name,set,finish,product,quantity,notes
      const lines = text.split(/[\r\n]+/).filter((l: string) => l.trim());

      const parsedLines: Array<{
        name: string;
        count: number;
        finish: string;
        set: string;
        notes: string;
      }> = [];
      for (const line of lines) {
        // Skip header line
        if (line.toLowerCase().startsWith("card name,")) {
          continue;
        }

        // Parse CSV - handle quoted fields properly
        const fields = parseCSVLine(line);
        if (fields.length < 5) {
          errors.push({
            name: line.substring(0, 30),
            message: "Invalid CSV format",
          });
          continue;
        }

        const name = fields[0].trim();
        const set = fields[1]?.trim() || "";
        const finish = fields[2]?.trim() || "Standard";
        // product is fields[3] - we don't need it
        const count = parseInt(fields[4], 10) || 1;
        const notes = fields[5]?.trim() || "";

        if (!name) {
          errors.push({
            name: line.substring(0, 30),
            message: "Missing card name",
          });
          continue;
        }

        parsedLines.push({ name, count, finish, set, notes });
      }

      // Batch lookup all card names with their variants
      const cardNames = parsedLines.map((p) => p.name);
      const cards = await prisma.card.findMany({
        where: { name: { in: cardNames, mode: "insensitive" } },
        select: {
          id: true,
          name: true,
          variants: {
            select: {
              id: true,
              setId: true,
              finish: true,
              set: { select: { name: true } },
            },
          },
        },
      });

      // Build lookup map: cardName -> { id, variants }
      const cardByName = new Map(cards.map((c) => [c.name.toLowerCase(), c]));

      // Match parsed lines to cards with variant resolution
      const matchedCards: Array<{
        cardId: number;
        variantId: number | null;
        setId: number | null;
        name: string;
        count: number;
        finish: string;
        notes: string;
      }> = [];
      for (const line of parsedLines) {
        const card = cardByName.get(line.name.toLowerCase());
        if (!card) {
          errors.push({ name: line.name, message: "Card not found" });
          added.push({ name: line.name, quantity: line.count, matched: false });
          continue;
        }

        // Try to find a matching variant by set name and finish
        let variantId: number | null = null;
        let setId: number | null = null;
        const normalizedFinish = normalizeFinish(line.finish);

        if (card.variants && card.variants.length > 0) {
          // First try exact set name + finish match
          let variant = card.variants.find(
            (v) =>
              v.set?.name?.toLowerCase() === line.set.toLowerCase() &&
              v.finish === normalizedFinish,
          );

          // Fall back to just set name match
          if (!variant && line.set) {
            variant = card.variants.find(
              (v) => v.set?.name?.toLowerCase() === line.set.toLowerCase(),
            );
          }

          // Fall back to any variant with matching finish
          if (!variant) {
            variant = card.variants.find((v) => v.finish === normalizedFinish);
          }

          // Final fallback: first available variant
          if (!variant) {
            variant = card.variants[0];
          }

          if (variant) {
            variantId = variant.id;
            setId = variant.setId;
          }
        }

        // Warn if no variant found (e.g., special product cards)
        if (!variantId) {
          errors.push({
            name: card.name,
            message: `No variant found for set "${line.set}" - card will show placeholder image`,
          });
        }

        matchedCards.push({
          cardId: card.id,
          variantId,
          setId,
          name: card.name,
          count: line.count,
          finish: normalizedFinish,
          notes: line.notes,
        });
      }

      // Batch check existing collection cards
      const cardIds = matchedCards.map((m) => m.cardId);
      const existingCards = await prisma.collectionCard.findMany({
        where: { userId, cardId: { in: cardIds } },
        select: {
          id: true,
          cardId: true,
          variantId: true,
          quantity: true,
          finish: true,
          notes: true,
        },
      });

      // Group by cardId+variantId+finish for proper matching
      const existingByKey = new Map(
        existingCards.map((e) => [
          `${e.cardId}-${e.variantId || "null"}-${e.finish}`,
          e,
        ]),
      );

      // Aggregate matched cards by unique key to handle duplicates in CSV
      // (e.g., same card in different editions resolving to same variant)
      const aggregatedByKey = new Map<
        string,
        {
          cardId: number;
          variantId: number | null;
          setId: number | null;
          name: string;
          count: number;
          finish: string;
          notes: string;
        }
      >();

      for (const match of matchedCards) {
        const key = `${match.cardId}-${match.variantId || "null"}-${
          match.finish
        }`;
        const existing = aggregatedByKey.get(key);
        if (existing) {
          existing.count += match.count;
          if (match.notes) {
            existing.notes = existing.notes
              ? `${existing.notes}; ${match.notes}`
              : match.notes;
          }
        } else {
          aggregatedByKey.set(key, { ...match });
        }
        added.push({
          name: match.name,
          quantity: match.count,
          matched: true,
          cardId: match.cardId,
        });
      }

      const updateOps = [];
      const createOps = [];

      for (const [key, match] of aggregatedByKey) {
        const existing = existingByKey.get(key);
        if (existing) {
          // Skip if user wants to only add new cards
          if (skipExisting) {
            continue;
          }
          const newQuantity = Math.min(99, existing.quantity + match.count);
          // Append notes if both have them, otherwise use whichever has content
          const newNotes =
            existing.notes && match.notes
              ? `${existing.notes}; ${match.notes}`
              : existing.notes || match.notes || null;
          updateOps.push(
            prisma.collectionCard.update({
              where: { id: existing.id },
              data: { quantity: newQuantity, notes: newNotes },
            }),
          );
        } else {
          createOps.push(
            prisma.collectionCard.create({
              data: {
                userId,
                cardId: match.cardId,
                variantId: match.variantId,
                setId: match.setId,
                finish: match.finish as "Standard" | "Foil",
                quantity: Math.min(99, match.count),
                notes: match.notes || null,
              },
            }),
          );
        }
      }

      if (updateOps.length > 0 || createOps.length > 0) {
        await prisma.$transaction([...updateOps, ...createOps]);
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
        // Also supports CardNexus format: "1 Valley (BETA)" or "1 13 Treasures of Britain"
        const parsed = parseCountAndNameCSV(line);
        if (!parsed) {
          errors.push({ name: line, message: "Could not parse line" });
          continue;
        }

        parsedLines.push(parsed);
      }

      // Batch lookup all card names at once with variants (1 query instead of N)
      const cardNames = parsedLines.map((p) => p.name);
      const cards = await prisma.card.findMany({
        where: {
          name: {
            in: cardNames,
            mode: "insensitive",
          },
        },
        select: {
          id: true,
          name: true,
          variants: {
            select: {
              id: true,
              setId: true,
              slug: true,
            },
            take: 1, // Just grab the first available variant
          },
        },
      });

      // Create lookup map (case-insensitive)
      const cardByName = new Map(cards.map((c) => [c.name.toLowerCase(), c]));

      // Match parsed lines to cards
      const matchedCards: Array<{
        cardId: number;
        variantId: number | null;
        setId: number | null;
        name: string;
        count: number;
      }> = [];
      for (const line of parsedLines) {
        const card = cardByName.get(line.name.toLowerCase());
        if (!card) {
          errors.push({ name: line.name, message: "Card not found" });
          added.push({ name: line.name, quantity: line.count, matched: false });
          continue;
        }
        const variant = card.variants?.[0];
        matchedCards.push({
          cardId: card.id,
          variantId: variant?.id ?? null,
          setId: variant?.setId ?? null,
          name: card.name,
          count: line.count,
        });
      }

      // Batch check existing collection cards (1 query instead of N)
      const cardIds = matchedCards.map((m) => m.cardId);
      const existingCards = await prisma.collectionCard.findMany({
        where: {
          userId,
          cardId: { in: cardIds },
          finish: "Standard",
        },
        select: {
          id: true,
          cardId: true,
          quantity: true,
          variantId: true,
          setId: true,
        },
      });

      const existingByCardId = new Map(existingCards.map((e) => [e.cardId, e]));

      // Batch upsert operations
      const updateOps = [];
      const createOps = [];

      for (const match of matchedCards) {
        const existing = existingByCardId.get(match.cardId);
        if (existing) {
          // Skip if user wants to only add new cards
          if (skipExisting) {
            continue;
          }
          const newQuantity = Math.min(99, existing.quantity + match.count);
          updateOps.push(
            prisma.collectionCard.update({
              where: { id: existing.id },
              data: {
                quantity: newQuantity,
                // Also update variant/set if missing
                variantId: existing.variantId ?? match.variantId,
                setId: existing.setId ?? match.setId,
              },
            }),
          );
        } else {
          createOps.push(
            prisma.collectionCard.create({
              data: {
                userId,
                cardId: match.cardId,
                variantId: match.variantId,
                setId: match.setId,
                finish: "Standard",
                quantity: Math.min(99, match.count),
              },
            }),
          );
        }
        added.push({
          name: match.name,
          quantity: match.count,
          matched: true,
          cardId: match.cardId,
        });
      }

      // Execute all upserts in a single transaction (1 transaction instead of N queries)
      if (updateOps.length > 0 || createOps.length > 0) {
        await prisma.$transaction([...updateOps, ...createOps]);
      }
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid format", code: "INVALID_FORMAT" }),
        { status: 400, headers: { "content-type": "application/json" } },
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
      },
    );
  }
}

// Helper: Parse a CSV line handling quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// Helper: Normalize finish string to match our enum
function normalizeFinish(finish: string): string {
  const lower = finish.toLowerCase();
  if (lower === "foil" || lower === "premium" || lower === "holo") {
    return "Foil";
  }
  return "Standard";
}

/**
 * Parse a CSV line with count and card name.
 * Handles:
 * - "4,Apprentice Wizard" or "4 Apprentice Wizard"
 * - Cards starting with numbers: "1 13 Treasures of Britain"
 * - CardNexus format: "1 Valley (BETA)"
 */
function parseCountAndNameCSV(
  line: string,
): { name: string; count: number } | null {
  // Strategy:
  // 1. First try to match "count separator name" where separator is space or comma
  //    This handles cards starting with numbers like "1 13 Treasures of Britain"
  // 2. Fall back to "countName" (no separator) for lines like "1Druid"
  //    Only if the name part doesn't start with a digit

  // Try with explicit separator first (space or comma after count)
  const withSep = line.match(/^(\d+)[,\s]+(.+)$/);
  if (withSep) {
    const count = parseInt(withSep[1], 10);
    if (!Number.isFinite(count) || count <= 0) return null;
    let name = withSep[2].trim().replace(/^["']|["']$/g, ""); // Remove quotes
    // Strip CardNexus set suffix like "(BETA)" for now - we just need the name
    name = name.replace(/\s*\([A-Z][A-Z0-9-]*\)\s*$/, "").trim();
    if (!name) return null;
    return { count, name };
  }

  // Fall back to no-separator format (e.g., "1Druid")
  // Only allow if the character after digits is NOT a digit
  const noSep = line.match(/^(\d+)([^\d].*)$/);
  if (noSep) {
    const count = parseInt(noSep[1], 10);
    if (!Number.isFinite(count) || count <= 0) return null;
    let name = noSep[2].trim().replace(/^["']|["']$/g, "");
    // Strip CardNexus set suffix
    name = name.replace(/\s*\([A-Z][A-Z0-9-]*\)\s*$/, "").trim();
    if (!name) return null;
    return { count, name };
  }

  return null;
}
