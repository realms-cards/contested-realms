import { findCard } from "../../vendor/untested-realm/shared/src/index";
import type { DeckList } from "../../vendor/untested-realm/shared/src/index";

/**
 * Turning a deck into something the engine can deal, for both sides of a match.
 *
 * In single player the client builds the deck; in a player-vs-player match the SERVER does,
 * because it is the one calling `createGame` — and the server cannot import from src/. So the
 * conversion lives here, next to the move generator, and src/lib/engine-mode/decks.ts re-exports
 * it alongside the parts that need our precon data.
 *
 * The engine is reached by RELATIVE path, never the `@sorcery/shared` alias: tsc does not
 * rewrite aliases into the CommonJS the server build emits.
 */

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

/** One card as the match record stores a submitted deck. */
export interface SubmittedCard {
  name: string;
  type: string;
  zone: string;
}

export type DeckConversion = { ok: true; deck: DeckList } | { ok: false; error: string };

/**
 * A deck as submitted over the wire, turned into an engine deck.
 *
 * Refuses rather than guesses. A card the engine has never heard of would otherwise surface
 * mid-match as a card that cannot be cast, so an engine match is not allowed to start on one —
 * which is why this reports every unknown name rather than the first.
 */
export function submittedDeckToEngine(cards: readonly SubmittedCard[], deckName: string): DeckConversion {
  if (!cards.length) return { ok: false, error: "That deck is empty." };
  const avatarCard = cards.find((card) => /avatar/i.test(card.type));
  if (!avatarCard) return { ok: false, error: "That deck has no avatar." };

  const unknown: string[] = [];
  const spellbook: Record<string, number> = {};
  const atlas: Record<string, number> = {};
  for (const card of cards) {
    if (card === avatarCard) continue;
    if (!findCard(card.name)) {
      if (!unknown.includes(card.name)) unknown.push(card.name);
      continue;
    }
    // The engine splits a deck the same way we do: sites in the atlas, everything else in the
    // spellbook. `zone` is what the submitting client already decided.
    const pile = /atlas|site/i.test(card.zone) || /site/i.test(card.type) ? atlas : spellbook;
    pile[card.name] = (pile[card.name] ?? 0) + 1;
  }
  if (unknown.length) {
    return { ok: false, error: `The rules engine does not know: ${unknown.slice(0, 5).join(", ")}` };
  }
  if (!findCard(avatarCard.name)) {
    return { ok: false, error: `The rules engine does not know the avatar ${avatarCard.name}.` };
  }
  return { ok: true, deck: { name: deckName, avatar: avatarCard.name, spellbook, atlas } };
}
