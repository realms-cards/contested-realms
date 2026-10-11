// Alternative card ARTS. See scripts/gen_printings.ts for how printings.json is built (one entry per
// distinct art-code per card, standard finish preferred). This module is the runtime accessor + the
// canonicalisation used when importing a deck's art choices.

import printingsData from './printings.json'
import { findCard } from './db'

export interface Printing {
  /** image slug, e.g. "999-deathspeaker-op-rf" → <CDN>/cards/<slug>.png (local: /cards/<slug>.webp) */
  slug: string
  /** set name for the picker label, e.g. "Promo", "Gothic" */
  set: string
  artist?: string
  /** true for the card's default (Beta) art — picking it clears any override */
  default?: boolean
}

/** card name → its distinct alternative arts (only cards that HAVE a choice appear). */
export const PRINTINGS: Record<string, Printing[]> = printingsData as Record<string, Printing[]>

const CDN = 'https://d27a44hjr9gen3.cloudfront.net/cards'
export function printingImageUrl(slug: string): string {
  return `${CDN}/${slug}.png`
}

/** the alternative arts available for a card (empty if it only has one art). */
export function printingsFor(name: string): Printing[] {
  return PRINTINGS[name] ?? []
}

/** the art-code of a slug — `<num>-<name>-<ARTCODE>-<finish>`. Identifies the ARTWORK (Alpha/Beta share
 *  `b`; a foil and its standard share an art-code). Null if the slug isn't the expected shape. */
export function artCodeOf(slug: string): string | null {
  const p = (slug ?? '').split('-')
  return p.length >= 4 ? p[p.length - 2] : null
}

/** Map a raw printing slug (from a sorcerytcg deck's card `src`, possibly a foil we don't cache) to the
 *  canonical art slug we actually ship — the standard-finish image for that art-code. Returns null when the
 *  art is the card's DEFAULT (no override needed) or the card/art is unknown (fall back to default art). */
export function canonicalArtSlug(name: string, rawSlug: string): string | null {
  const code = artCodeOf(rawSlug)
  if (!code) return null
  const arts = printingsFor(findCard(name)?.name ?? name)
  const match = arts.find((a) => artCodeOf(a.slug) === code)
  if (!match || match.default) return null // default art → no override
  return match.slug
}
