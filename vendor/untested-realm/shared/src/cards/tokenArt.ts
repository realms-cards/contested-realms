// Custom TOKEN art: an admin uploads an image for a token (Skeleton, Foot Soldier, Frog) and grants it to
// chosen accounts. A granted player picks it in the deck builder; it rides in deck.art like any printing,
// as the slug `custom:<id>`. The server serves the image publicly by its unguessable id (so the opponent
// sees the token) but only lets granted accounts (and admins) START a game with it — see sanitizeCustomArt.

import type { DeckList } from '../engine/decks'
import type { GameState, PlayerId } from '../engine/types'
import { printingsFor } from './printings'

/** the tokens that may carry custom art */
export const CUSTOM_ART_TOKENS = ['Skeleton', 'Foot Soldier', 'Frog'] as const

const PREFIX = 'custom:'

export function isCustomArt(slug: string | undefined | null): slug is string {
  return typeof slug === 'string' && slug.startsWith(PREFIX)
}
export function customArtSlug(id: string): string { return PREFIX + id }
export function customArtId(slug: string): string { return slug.slice(PREFIX.length) }
/** where the image is served (same origin: the game server, or Vite's /api proxy in dev) */
export function customArtUrl(slug: string): string { return `/api/token-art/${encodeURIComponent(customArtId(slug))}` }

/** A copy of `deck` keeping only the arts its player may use: a custom art only on a custom-art token and
 *  in `allowed` (the art ids granted to the account; 'all' for an admin); anything else only if it's a real
 *  printing of that card — so a custom image can't sneak in disguised as a "printing" path. */
export function sanitizeCustomArt<D extends Pick<DeckList, 'art'>>(deck: D, allowed: ReadonlySet<string> | 'all'): D {
  if (!deck?.art) return deck
  const art: Record<string, string> = {}
  for (const [name, slug] of Object.entries(deck.art)) {
    if (isCustomArt(slug)) {
      if (!(CUSTOM_ART_TOKENS as readonly string[]).includes(name)) continue
      if (allowed !== 'all' && !allowed.has(customArtId(slug))) continue
    } else if (!printingsFor(name).some((p) => p.slug === slug)) continue
    art[name] = slug
  }
  return { ...deck, art: Object.keys(art).length ? art : undefined }
}

/** the deck's art for its player's tokens (undefined when it picks none) */
export function tokenArtOf(deck: Pick<DeckList, 'art'>): Record<string, string> | undefined {
  let out: Record<string, string> | undefined
  for (const name of CUSTOM_ART_TOKENS) if (deck.art?.[name]) (out ??= {})[name] = deck.art[name]
  return out
}

/** an art slug safe to put in an image path: a printing slug or a custom art id — plain [A-Za-z0-9_-] */
export function isSafeArtSlug(slug: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(isCustomArt(slug) ? customArtId(slug) : slug)
}

/** the art a `name` token created for `player` carries (their deck's pick), if any */
export function tokenArtFor(state: Pick<GameState, 'players'>, player: PlayerId, name: string): string | undefined {
  return state.players[player]?.tokenArt?.[name]
}
