import type { DeckLoadPayload } from "@/lib/game/deckLoader";
import type { SummitTopDeck, SummitTopDecks } from "@/lib/summit/top-decks";

/**
 * The deck categories every deck picker offers besides the player's own decks:
 *  - Precons — the system precon decks (GET /api/decks `publicDecks`)
 *  - Top 8 from <event> — the latest offline event's top-8 lists from Sorcerers Summit. They are
 *    sorcerytcg.com links, not saved decks: picking one resolves the list on the fly.
 *  - Public decks — other players' decks marked public, fetched only when the section is opened.
 */

export type { SummitTopDeck, SummitTopDecks };

/** One row of GET /api/decks/public. */
export interface PublicDeckListEntry {
  id: string;
  name: string;
  format: string;
  userName: string;
  updatedAt: string;
  avatarState: "none" | "single" | "multiple";
  avatarCard: { name: string; slug: string | null } | null;
}

/** A picker value that names a top-8 deck by its link (saved decks are plain ids). */
export const TOP8_PREFIX = "top8:";

export const isTop8Value = (value: string): boolean => value.startsWith(TOP8_PREFIX);
export const top8Value = (deck: SummitTopDeck): string => `${TOP8_PREFIX}${deck.url}`;
export const top8Url = (value: string): string => value.slice(TOP8_PREFIX.length);

/** "Top 8 — <event name>", the section title. */
export function top8Title(top: Pick<SummitTopDecks, "eventName">): string {
  return `Top 8 — ${top.eventName}`;
}

/** "1st · Player — Deck (Avatar)" */
export function top8Label(deck: SummitTopDeck): string {
  const place = deck.placing ? `${ordinal(deck.placing)} · ` : "";
  const name = deck.deckName ? ` — ${deck.deckName}` : "";
  const avatar = deck.avatar ? ` (${deck.avatar})` : "";
  return `${place}${deck.player}${name}${avatar}`;
}

function ordinal(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** The cached top-8 list, or null when there is none (no event collected yet, or offline). */
export async function fetchTopDecks(): Promise<SummitTopDecks | null> {
  try {
    const res = await fetch("/api/summit/top-decks");
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<SummitTopDecks>;
    if (!data?.eventName || !Array.isArray(data.decks) || data.decks.length === 0) return null;
    const decks = [...data.decks].sort((a, b) => (a.placing ?? 99) - (b.placing ?? 99));
    return { ...(data as SummitTopDecks), decks };
  } catch {
    return null;
  }
}

/** Other players' public decks (lazy: call when the section is opened). */
export async function fetchPublicDecks(q = ""): Promise<PublicDeckListEntry[]> {
  const res = await fetch(`/api/decks/public${q ? `?q=${encodeURIComponent(q)}` : ""}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load public decks");
  const data = (await res.json()) as { decks?: PublicDeckListEntry[] };
  return Array.isArray(data.decks) ? data.decks : [];
}

/** Resolve a deck link (a top-8 list) into the card refs the game loader takes; nothing is saved. */
export async function resolveDeckLink(url: string): Promise<DeckLoadPayload> {
  const res = await fetch("/api/guest/deck", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = (await res.json().catch(() => ({}))) as DeckLoadPayload & { error?: unknown; unresolved?: { name: string }[] };
  if (!res.ok) {
    const msg = typeof data.error === "string" ? data.error : "Could not load deck";
    const unresolved = Array.isArray(data.unresolved) ? data.unresolved.map((c) => c.name).slice(0, 5).join(", ") : "";
    throw new Error(unresolved ? `${msg}: ${unresolved}` : msg);
  }
  return data;
}
