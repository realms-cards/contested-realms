// Import a deck from a curiosa.io deck link. The network fetch is done by the
// SERVER (curiosa's tRPC API enforces an Origin check + browser CORS would block
// it), which then calls `curiosaToDeck` — the pure mapping below — to produce a
// DeckList the deck builder understands.

import type { DeckList } from '../engine/decks'
import { findCard } from './db'

/** A card entry as returned by curiosa's deck.getDecklistById / getSideboardById /
 *  getAvatarById procedures: `{ quantity, card: { name, type } }`. */
export interface CuriosaEntry {
  quantity: number
  card: { name: string; type?: string }
}

export interface CuriosaDeckRaw {
  name?: string
  avatar?: CuriosaEntry | null
  decklist?: CuriosaEntry[]
  sideboard?: CuriosaEntry[]
}

/** Accept a full curiosa deck URL, a bare id, or a URL with extra path/query.
 *  Returns the deck id, or null if nothing that looks like one is present.
 *  Curiosa ids are cuid-style: lowercase alphanumeric, ~25 chars. */
export function extractCuriosaDeckId(input: string): string | null {
  const s = (input ?? '').trim()
  if (!s) return null
  // .../decks/<id> (ignore any trailing /slug, query or hash)
  const m = s.match(/curiosa\.io\/decks\/([a-z0-9]+)/i)
  if (m) return m[1]
  // a bare id pasted on its own
  if (/^[a-z0-9]{20,32}$/i.test(s)) return s
  return null
}

/** Map curiosa's raw deck payload into a DeckList. Unknown card names are kept
 *  verbatim (validateDeck will flag them) rather than silently dropped, so an
 *  import is transparent. Sites go to the atlas, everything else to the
 *  spellbook; the sideboard becomes the deck's collection. */
export function curiosaToDeck(raw: CuriosaDeckRaw, fallbackName = 'Imported deck'): DeckList {
  const norm = (name: string) => findCard(name)?.name ?? name
  const isSite = (e: CuriosaEntry) => (e.card.type ?? findCard(e.card.name)?.type) === 'Site'

  const deck: DeckList = {
    name: raw.name?.trim() || fallbackName,
    avatar: raw.avatar?.card ? norm(raw.avatar.card.name) : '',
    spellbook: {},
    atlas: {},
  }
  for (const e of raw.decklist ?? []) {
    if (!e?.card?.name || e.quantity <= 0) continue
    const bucket = isSite(e) ? deck.atlas : deck.spellbook
    const n = norm(e.card.name)
    bucket[n] = (bucket[n] ?? 0) + e.quantity
  }
  const collection: Record<string, number> = {}
  for (const e of raw.sideboard ?? []) {
    if (!e?.card?.name || e.quantity <= 0) continue
    const n = norm(e.card.name)
    collection[n] = (collection[n] ?? 0) + e.quantity
  }
  if (Object.keys(collection).length) deck.collection = collection
  return deck
}
