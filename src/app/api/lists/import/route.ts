import type { Finish } from "@prisma/client";
import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface ImportCard {
  name: string;
  quantity?: number;
  finish?: "Standard" | "Foil";
  notes?: string;
}

// POST /api/lists/import - Import a list from text format
export async function POST(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const { name, description, isPublic, text, format = "text" } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Name is required", code: "INVALID_INPUT" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    if (!text || typeof text !== "string") {
      return new Response(
        JSON.stringify({
          error: "Import text is required",
          code: "INVALID_INPUT",
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true },
    });

    if (!user) {
      return new Response(
        JSON.stringify({
          error:
            "Your account could not be found in the database. Please sign out and sign back in.",
          code: "USER_NOT_FOUND",
        }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    }

    // Parse the import text
    let cardsToImport: ImportCard[] = [];

    if (format === "json") {
      try {
        const parsed = JSON.parse(text);
        cardsToImport = Array.isArray(parsed) ? parsed : parsed.cards || [];
      } catch {
        return new Response(
          JSON.stringify({
            error: "Invalid JSON format",
            code: "INVALID_FORMAT",
          }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
    } else {
      // Text format: "quantity cardname" or just "cardname" per line
      const lines = text
        .split("\n")
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 0);

      for (const line of lines) {
        // Skip comment lines
        if (line.startsWith("#") || line.startsWith("//")) continue;

        // Try to parse "N Card Name" or just "Card Name"
        const match =
          line.match(/^(\d+)\s*[xX]?\s*(.+)$/) || line.match(/^(.+)$/);
        if (match) {
          const hasQuantity = match.length === 3;
          const quantity = hasQuantity ? parseInt(match[1], 10) : 1;
          const cardName = hasQuantity ? match[2].trim() : match[1].trim();

          if (cardName) {
            cardsToImport.push({
              name: cardName,
              quantity: Math.min(99, Math.max(1, quantity)),
            });
          }
        }
      }
    }

    if (cardsToImport.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No valid cards found in import",
          code: "EMPTY_IMPORT",
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // Look up card IDs by name
    const cardNames = Array.from(
      new Set(cardsToImport.map((c) => c.name.toLowerCase()))
    );
    const foundCards = await prisma.card.findMany({
      where: {
        name: { in: cardNames, mode: "insensitive" },
      },
      include: {
        variants: {
          take: 1,
          include: { set: true },
        },
      },
    });

    const cardMap = new Map(
      foundCards.map((c: (typeof foundCards)[number]) => [
        c.name.toLowerCase(),
        c,
      ])
    );

    // Create the list
    const list = await prisma.cardList.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        isPublic: Boolean(isPublic),
        userId: session.user.id,
      },
    });

    // Add cards to the list
    const results = { added: 0, notFound: [] as string[] };

    for (const importCard of cardsToImport) {
      const card = cardMap.get(importCard.name.toLowerCase());
      if (!card) {
        results.notFound.push(importCard.name);
        continue;
      }

      const variant = card.variants[0];

      try {
        await prisma.cardListCard.create({
          data: {
            listId: list.id,
            cardId: card.id,
            variantId: variant?.id ?? null,
            setId: variant?.setId ?? null,
            finish: (importCard.finish as Finish) || "Standard",
            quantity: Math.min(99, importCard.quantity || 1),
            notes: importCard.notes?.trim() || null,
          },
        });
        results.added++;
      } catch {
        // Skip duplicates
      }
    }

    return new Response(
      JSON.stringify({
        id: list.id,
        name: list.name,
        added: results.added,
        notFound: results.notFound,
      }),
      { status: 201, headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
