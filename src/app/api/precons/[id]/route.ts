import { NextResponse } from "next/server";
import cardData from "@/lib/game/cpu/cards.json";
import { betaPrecons } from "@/lib/game/cpu/precons";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deck = betaPrecons.find(item => item.id === id);
  if (!deck) return NextResponse.json({ error: "Unknown precon" }, { status: 404 });
  const entries = [{ name: deck.avatar, count: 1 }, ...deck.spellbook, ...deck.atlas];
  const cards = await prisma.card.findMany({
    where: { name: { in: entries.map(entry => entry.name) } },
    select: { id: true, name: true, variants: { select: { id: true, slug: true }, orderBy: { id: "asc" } } },
  });
  if (cards.length !== entries.length) {
    return NextResponse.json({ error: "The card database is missing cards required by this precon." }, { status: 503 });
  }
  const byName = new Map(cards.map(card => [card.name, card]));
  const expand = (list: { name: string; count: number }[]) => list.flatMap(entry => {
    const card = byName.get(entry.name);
    if (!card) throw new Error(`Missing precon card: ${entry.name}`);
    const metadata = cardData[entry.name as keyof typeof cardData];
    const variant = card.variants.find(variant => variant.slug.startsWith("bet-")) || card.variants[0];
    return Array.from({ length: entry.count }, () => ({
      cardId: card.id, variantId: variant?.id ?? null,
      slug: variant?.slug ?? null, name: card.name, type: metadata.type,
      text: metadata.rulesText, cost: metadata.cost, attack: metadata.attack,
      defence: metadata.defence, thresholds: metadata.thresholds, subTypes: metadata.subTypes,
    }));
  });
  return NextResponse.json({ name: deck.name, format: "Constructed", imported: true,
    spellbook: expand([{ name: deck.avatar, count: 1 }, ...deck.spellbook]), atlas: expand(deck.atlas), collection: [] });
}
