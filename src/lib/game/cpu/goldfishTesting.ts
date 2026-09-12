import cards from "@/lib/game/cpu/cards.json";
import { supportsSpell } from "@/lib/game/cpu/spells";
import type { DeckLoadPayload } from "@/lib/game/deckLoader";
import type { CardRef } from "@/lib/game/store/types";

export type CoverageLevel = "automated" | "partial" | "manual";
export interface CoverageEntry { name: string; count: number; level: CoverageLevel }

/** Conservative capability report, not a claim of full rules compliance. */
export function goldfishCoverage(deck: DeckLoadPayload): CoverageEntry[] {
  const entries = new Map<string, CoverageEntry>();
  const list = [...(deck.spellbook || []),...(deck.atlas || []),...(deck.collection || [])];
  if (deck.champion) list.push({...deck.champion,type:"Minion"});
  for (const card of list) {
    const known = Object.prototype.hasOwnProperty.call(cards,card.name);
    const level: CoverageLevel = card.type === "Magic" && supportsSpell(card.name) ? "automated" : known ? "partial" : "manual";
    const key = `${card.name}:${level}`, previous = entries.get(key);
    entries.set(key,{name:card.name,count:(previous?.count || 0)+1,level});
  }
  return [...entries.values()].sort((a,b) => a.name.localeCompare(b.name));
}

export interface GoldfishDeckSnapshot { name: string; deck: DeckLoadPayload }
const deckKey = (playerId: string) => `sorcery:goldfish:last-deck:${playerId}`;
export const goldfishOpponentKey = (playerId: string) => `sorcery:goldfish:opponent:${playerId}`;

function isCard(value: unknown): value is CardRef {
  return typeof value === "object" && value !== null && "cardId" in value && typeof value.cardId === "number" &&
    "name" in value && typeof value.name === "string" && "type" in value && typeof value.type === "string";
}
export function readGoldfishDeck(storage: Pick<Storage,"getItem">, playerId: string): GoldfishDeckSnapshot | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(deckKey(playerId)) || "null");
    if (!value || typeof value !== "object" || !("name" in value) || typeof value.name !== "string" || !("deck" in value)) return null;
    const deck = value.deck;
    if (!deck || typeof deck !== "object") return null;
    const spellbook = "spellbook" in deck ? deck.spellbook : [], atlas = "atlas" in deck ? deck.atlas : [], collection = "collection" in deck ? deck.collection : [];
    if (!Array.isArray(spellbook) || !spellbook.every(isCard) || !Array.isArray(atlas) || !atlas.every(isCard) || !Array.isArray(collection) || !collection.every(isCard)) return null;
    const champion = "champion" in deck ? deck.champion : null;
    let parsedChampion: DeckLoadPayload["champion"] = null;
    if (champion) {
      if (typeof champion !== "object" || !("cardId" in champion) || typeof champion.cardId !== "number" || !("name" in champion) || typeof champion.name !== "string") return null;
      parsedChampion = {cardId:champion.cardId,name:champion.name,...("slug" in champion && typeof champion.slug === "string" ? {slug:champion.slug} : {})};
    }
    return {name:value.name,deck:{spellbook,atlas,collection,champion:parsedChampion}};
  } catch { return null; }
}
export function saveGoldfishDeck(storage: Pick<Storage,"setItem">, playerId: string, snapshot: GoldfishDeckSnapshot): boolean {
  try { storage.setItem(deckKey(playerId),JSON.stringify(snapshot)); return true; }
  catch { return false; }
}
