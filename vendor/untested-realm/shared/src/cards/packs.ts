// Sealed / Limited support: deterministic (seeded) booster + pool generation, and
// the official Draft Kit "supplied" pool that players may freely draw on when building
// a Sealed deck. Kept engine-pure (no Date.now/Math.random) so the SERVER can generate
// each seat's pool from a seed and it is reproducible on resume / for both clients.

import { allCards } from './db'
import type { CardDef } from '../engine/types'

export type PackEdition = 'Alpha' | 'Beta' | 'Arthurian Legends' | 'Gothic'
export const PACK_EDITIONS: readonly PackEdition[] = ['Alpha', 'Beta', 'Arthurian Legends', 'Gothic']
/** what the room creator may pick — a specific edition, or a random one per pack */
export type PackEditionChoice = PackEdition | 'Random'

// ── The official Sorcery Draft Kit "supplied" pool ────────────────────────────
// Always freely available while building a Sealed deck (the draft-kit default):
//  • the Spellslinger avatar (start with 4 spells; Tap → play/draw a site), and
//  • any number of the four basic elemental Sites — threshold + mana only.
export const SEALED_SUPPLIED_AVATAR = 'Spellslinger'
export const SEALED_SUPPLIED_SITES: readonly string[] = ['Spire', 'Stream', 'Valley', 'Wasteland']
const SUPPLIED_SITE_SET = new Set<string>(SEALED_SUPPLIED_SITES)
/** a basic Site the draft kit supplies in unlimited quantity */
export function isSuppliedSite(name: string): boolean {
  return SUPPLIED_SITE_SET.has(name)
}

// ── seeded RNG (mulberry32) — a self-contained, reproducible PRNG ─────────────
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Avatars ARE in real boosters, at their edition, at their rarity — their rarities are
// filled in at DB load (see UNIQUE_AVATARS in db.ts), so they flow through the rare slot
// naturally. No card type is excluded from the pool.
function poolOf(edition: PackEdition, rarity: CardDef['rarity']): string[] {
  return allCards
    .filter((c) => c.sets.includes(edition) && c.rarity === rarity)
    .map((c) => c.name)
}

function pick(arr: string[], rand: () => number): string {
  return arr[Math.floor(rand() * arr.length)]
}

/**
 * One 15-card booster (names only), mirroring real slot odds: 11 Ordinary, 3
 * Exceptional, 1 rare (25% Unique else Elite). Avatars of the edition ARE in the pool
 * (at Elite/Unique rarity — see effectiveRarity), so the rare slot can be an Avatar,
 * just like a real pack. Finishes are irrelevant to gameplay so sealed packs are plain.
 */
export function generateBooster(edition: PackEdition, rand: () => number): string[] {
  const out: string[] = []
  const ordinaries = poolOf(edition, 'Ordinary')
  const exceptionals = poolOf(edition, 'Exceptional')
  const elites = poolOf(edition, 'Elite')
  const uniques = poolOf(edition, 'Unique')
  for (let i = 0; i < Math.min(11, ordinaries.length); i++) out.push(pick(ordinaries, rand))
  for (let i = 0; i < Math.min(3, exceptionals.length); i++) out.push(pick(exceptionals, rand))
  const rarePool = rand() < 0.25 && uniques.length ? uniques : elites.length ? elites : uniques
  if (rarePool.length) out.push(pick(rarePool, rand))
  return out
}

/**
 * A Sealed pool as a list of individual BOOSTERS (each a list of card names): `numPacks`
 * boosters of `edition` (or a random edition per pack when 'Random'). Deterministic in
 * `seed`. This preserves pack boundaries so the client can open them one at a time.
 */
export function generateSealedPacks(edition: PackEditionChoice, numPacks: number, seed: number): string[][] {
  const rand = mulberry32(seed)
  const packs: string[][] = []
  for (let p = 0; p < numPacks; p++) {
    const ed: PackEdition = edition === 'Random' ? PACK_EDITIONS[Math.floor(rand() * PACK_EDITIONS.length)] : edition
    packs.push(generateBooster(ed, rand))
  }
  return packs
}

/** flatten a list of boosters into a card name → count pool (for validation / building). */
export function aggregatePool(packs: string[][]): Record<string, number> {
  const pool: Record<string, number> = {}
  for (const pk of packs) for (const name of pk) pool[name] = (pool[name] ?? 0) + 1
  return pool
}

/** A full Sealed pool aggregated to a card name → count map. Deterministic in `seed`. */
export function generateSealedPool(edition: PackEditionChoice, numPacks: number, seed: number): Record<string, number> {
  return aggregatePool(generateSealedPacks(edition, numPacks, seed))
}
