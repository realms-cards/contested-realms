// Import a deck from a sorcerytcg.com deck link. sorcerytcg.com is the official deck builder and the
// successor to curiosa.io (which is being retired). Its public API — https://api.sorcerytcg.com/api/decks/<id>
// — already splits the deck into avatar / spellbook / atlas / sideboard, which maps almost 1:1 onto our
// DeckList. The network fetch lives on the SERVER (see importSorceryDeck); this module is the pure mapping.

import type { DeckList } from '../engine/decks'
import { findCard } from './db'
import { canonicalArtSlug } from './printings'

/** A card entry as returned by api.sorcerytcg.com: `{ identifier(slug), name, quantity, metadata:{type},
 *  src }`. `src` is the CDN image URL of the exact printing the deck uses — we read the ART from it. */
export interface SorceryEntry {
  identifier?: string
  name: string
  quantity: number
  metadata?: { type?: string }
  src?: string
}

/** The deck payload from api.sorcerytcg.com/api/decks/<id>. Cards are pre-bucketed by the API. */
export interface SorceryDeckRaw {
  name?: string
  visibility?: string
  avatar?: SorceryEntry[]
  spellbook?: SorceryEntry[]
  atlas?: SorceryEntry[]
  sideboard?: SorceryEntry[]
}

/** Accept a full sorcerytcg deck URL or a bare id. Returns the deck id, or null if none is present.
 *  Ids are cuid-style: lowercase alphanumeric, ~25 chars. curiosa.io is retired, so a bare id defaults
 *  here rather than to the old importer. */
export function extractSorceryDeckId(input: string): string | null {
  const s = (input ?? '').trim()
  if (!s) return null
  // .../decks/<id> (ignore any trailing /slug, query or hash)
  const m = s.match(/sorcerytcg\.com\/decks\/([a-z0-9]+)/i)
  if (m) return m[1]
  // a bare id pasted on its own (not a curiosa.io URL — those still route to the legacy importer)
  if (!/curiosa\.io/i.test(s) && /^[a-z0-9]{20,32}$/i.test(s)) return s
  return null
}

/** Map a sorcerytcg deck payload into a DeckList. Unknown card names are kept verbatim (validateDeck will
 *  flag them) rather than silently dropped, so an import is transparent. The API already separates sites
 *  (atlas) from spells (spellbook), but we still classify each card by type for robustness; the sideboard
 *  becomes the deck's collection. */
export function sorceryToDeck(raw: SorceryDeckRaw, fallbackName = 'Imported deck'): DeckList {
  const norm = (name: string) => findCard(name)?.name ?? name
  const isSite = (e: SorceryEntry) => (e.metadata?.type ?? findCard(e.name)?.type) === 'Site'

  const deck: DeckList = {
    name: raw.name?.trim() || fallbackName,
    avatar: raw.avatar?.[0]?.name ? norm(raw.avatar[0].name) : '',
    spellbook: {},
    atlas: {},
  }
  // capture each card's chosen ART (from its printing `src`) — canonicalised to the art we ship, and only
  // when it differs from the default. So an imported deck keeps its promo/alt-art picks.
  const art: Record<string, string> = {}
  const slugFrom = (src?: string) => src?.split('/').pop()?.replace(/\.[a-z]+$/i, '') ?? ''
  const noteArt = (name: string, e: SorceryEntry) => {
    const alt = e.src ? canonicalArtSlug(name, slugFrom(e.src)) : null
    if (alt) art[name] = alt
  }
  const avatarEntry = raw.avatar?.[0]
  if (avatarEntry?.name) noteArt(deck.avatar, avatarEntry)
  for (const e of [...(raw.spellbook ?? []), ...(raw.atlas ?? [])]) {
    if (!e?.name || e.quantity <= 0) continue
    const bucket = isSite(e) ? deck.atlas : deck.spellbook
    const n = norm(e.name)
    bucket[n] = (bucket[n] ?? 0) + e.quantity
    noteArt(n, e)
  }
  const collection: Record<string, number> = {}
  for (const e of raw.sideboard ?? []) {
    if (!e?.name || e.quantity <= 0) continue
    const n = norm(e.name)
    collection[n] = (collection[n] ?? 0) + e.quantity
    noteArt(n, e)
  }
  if (Object.keys(collection).length) deck.collection = collection
  if (Object.keys(art).length) deck.art = art
  return deck
}
