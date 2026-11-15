import { NextResponse } from "next/server";
import cardData from "@/lib/game/cpu/cards.json";
import { cpuPrecons } from "@/lib/game/cpu/precons";
import { prisma } from "@/lib/prisma";

type Thresholds = Partial<Record<"air" | "earth" | "fire" | "water", number>>;

/** The card fields a precon row carries, from the CPU card table or the DB. */
interface PreconCardMeta {
  type: string;
  rulesText: string | null;
  cost: number | null;
  attack: number | null;
  defence: number | null;
  thresholds: Thresholds | null;
  subTypes: string | null;
}

const cpuCards = cardData as Record<string, PreconCardMeta | undefined>;

function isThresholds(value: unknown): value is Thresholds {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Slug prefix of the printings a precon shows: its own set (FvL) or Beta */
function slugPrefixFor(set: string | undefined): string {
  return set?.toLowerCase().startsWith("frost mage") ? "fvl-" : "bet-";
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deck = cpuPrecons.find(item => item.id === id);
  if (!deck) return NextResponse.json({ error: "Unknown precon" }, { status: 404 });
  const collection = deck.collection ?? [];
  const names = [...new Set([deck.avatar, ...deck.spellbook, ...deck.atlas, ...collection]
    .map(entry => typeof entry === "string" ? entry : entry.name))];
  const cards = await prisma.card.findMany({
    where: { name: { in: names } },
    select: {
      id: true, name: true, subTypes: true,
      variants: { select: { id: true, slug: true, setId: true }, orderBy: { id: "asc" } },
      meta: { select: { setId: true, type: true, rulesText: true, cost: true, attack: true, defence: true, thresholds: true } },
    },
  });
  if (cards.length !== names.length) {
    return NextResponse.json({ error: "The card database is missing cards required by this precon." }, { status: 503 });
  }
  const byName = new Map(cards.map(card => [card.name, card]));
  const prefix = slugPrefixFor(deck.set);
  const expand = (list: { name: string; count: number }[]) => list.flatMap(entry => {
    const card = byName.get(entry.name);
    if (!card) throw new Error(`Missing precon card: ${entry.name}`);
    const variant = card.variants.find(variant => variant.slug.startsWith(prefix)) || card.variants[0];
    // The CPU card table covers the Beta precons; newer cards read the DB (the newest printing supersedes)
    const dbMeta = card.meta.find(meta => meta.setId === variant?.setId) ?? card.meta[card.meta.length - 1];
    const metadata: PreconCardMeta = cpuCards[entry.name] ?? {
      type: dbMeta?.type ?? "",
      rulesText: dbMeta?.rulesText ?? null,
      cost: dbMeta?.cost ?? null,
      attack: dbMeta?.attack ?? null,
      defence: dbMeta?.defence ?? null,
      thresholds: isThresholds(dbMeta?.thresholds) ? dbMeta.thresholds : null,
      subTypes: card.subTypes ?? null,
    };
    return Array.from({ length: entry.count }, () => ({
      cardId: card.id, variantId: variant?.id ?? null,
      slug: variant?.slug ?? null, name: card.name, type: metadata.type,
      text: metadata.rulesText, cost: metadata.cost, attack: metadata.attack,
      defence: metadata.defence, thresholds: metadata.thresholds, subTypes: metadata.subTypes,
    }));
  });
  return NextResponse.json({ name: deck.name, format: "Constructed", imported: true,
    spellbook: expand([{ name: deck.avatar, count: 1 }, ...deck.spellbook]), atlas: expand(deck.atlas),
    collection: expand(collection) });
}
