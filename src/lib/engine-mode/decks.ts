import { betaPrecons } from "@/lib/game/cpu/precons";
import { findCard, getScript } from "@sorcery/shared";
import type { DeckList } from "@sorcery/shared";

/** Deck list as our precon JSON and deck exports store it. */
export interface NamedCountDeck {
  id?: string;
  name: string;
  avatar: string;
  spellbook: { name: string; count: number }[];
  atlas: { name: string; count: number }[];
}

function toCounts(entries: { name: string; count: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { name, count } of entries) out[name] = (out[name] ?? 0) + count;
  return out;
}

/** Card names are identical in both card databases, so decks map one-to-one. */
export function toEngineDeck(deck: NamedCountDeck): DeckList {
  return {
    id: deck.id,
    name: deck.name,
    avatar: deck.avatar,
    spellbook: toCounts(deck.spellbook),
    atlas: toCounts(deck.atlas),
  };
}

export const enginePrecons: NamedCountDeck[] = betaPrecons;

/** A card row as /api/decks/[id] and /api/guest/deck return it: one entry per copy. */
interface ApiDeckCard {
  name: string;
  type?: string | null;
}

/** The deck payload shared by /api/decks/[id] and /api/guest/deck. */
export interface ApiDeckData {
  name?: string;
  spellbook?: ApiDeckCard[];
  atlas?: ApiDeckCard[];
  collection?: ApiDeckCard[];
}

export type EngineDeckResult = { ok: true; deck: DeckList } | { ok: false; error: string };

/**
 * Convert one of our saved or imported decks. The avatar travels inside the spellbook/atlas
 * rows; the engine's own card data decides what is an avatar and rejects unknown names.
 */
export function apiDeckToEngine(data: ApiDeckData, fallbackName: string): EngineDeckResult {
  const spellbook: Record<string, number> = {};
  const atlas: Record<string, number> = {};
  const collection: Record<string, number> = {};
  const avatars = new Set<string>();
  const unknown = new Set<string>();
  const add = (into: Record<string, number>, rows: ApiDeckCard[] | undefined, allowAvatar: boolean) => {
    for (const row of rows ?? []) {
      const def = findCard(row.name);
      if (!def) {
        unknown.add(row.name);
        continue;
      }
      if (def.type === "Avatar" && allowAvatar) {
        avatars.add(def.name);
        continue;
      }
      into[def.name] = (into[def.name] ?? 0) + 1;
    }
  };
  add(spellbook, data.spellbook, true);
  add(atlas, data.atlas, true);
  add(collection, data.collection, false);

  if (unknown.size) return { ok: false, error: `Unknown cards: ${[...unknown].slice(0, 5).join(", ")}` };
  if (avatars.size !== 1) {
    return { ok: false, error: avatars.size ? "The deck has more than one avatar." : "The deck has no avatar." };
  }
  // The Magician keeps its sites in the spellbook and leaves the atlas empty — the engine
  // says so itself ("Magician: sites go in the spellbook, the atlas stays empty",
  // engine/decks.ts) and builds the piles that way in setup.ts. Demanding both piles here
  // rejected a legal deck that imports fine everywhere else in the app.
  const avatarName = [...avatars][0];
  const sitesInSpellbook = !!getScript(avatarName)?.sitesInSpellbook;
  if (!Object.keys(spellbook).length) {
    return { ok: false, error: "The deck has no spellbook." };
  }
  if (!sitesInSpellbook && !Object.keys(atlas).length) {
    return { ok: false, error: `The deck has no atlas (only ${avatarName} may keep its sites in the spellbook).` };
  }
  return {
    ok: true,
    deck: { name: data.name || fallbackName, avatar: avatarName, spellbook, atlas, collection },
  };
}

/** Where a deck comes from in the engine-mode setup. */
export type DeckSource =
  | { kind: "builtin"; id: string }
  | { kind: "saved"; id: string; name: string }
  | { kind: "link"; url: string };

export async function loadEngineDeck(source: DeckSource): Promise<EngineDeckResult> {
  if (source.kind === "builtin") {
    const precon = enginePrecons.find((d) => d.id === source.id);
    return precon ? { ok: true, deck: toEngineDeck(precon) } : { ok: false, error: "Unknown precon." };
  }
  const res =
    source.kind === "saved"
      ? await fetch(`/api/decks/${encodeURIComponent(source.id)}`, { cache: "no-store" })
      : await fetch("/api/guest/deck", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: source.url }),
        });
  const data = (await res.json().catch(() => ({}))) as ApiDeckData & { error?: string };
  if (!res.ok) return { ok: false, error: data.error ?? "Could not load the deck." };
  return apiDeckToEngine(data, source.kind === "saved" ? source.name : "Imported deck");
}
