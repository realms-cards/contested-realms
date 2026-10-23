import type { ParsedKeywords } from '../cards/db'
import type { Element } from './types'

// Keyword grants are typed DATA, not text: a card script says `'airborne'` or `{ movement: 2 }` and the
// engine sets the matching property — nothing is parsed at run time, and a misspelt or invented keyword is
// a compile error. (Printed card text is parsed once per card, in getKeywords.)

/** the on/off keyword abilities, named exactly as their ParsedKeywords property */
export type KeywordFlag =
  | 'airborne' | 'burrowing' | 'submerge' | 'voidwalk' | 'charge' | 'immobile' | 'lethal' | 'stealth' | 'ward'
  | 'strikeFirst' | 'lance' | 'spellcaster' | 'waterbound' | 'landbound'

/** one keyword a card grants */
export type KeywordGrant =
  | KeywordFlag
  /** extra steps (negative: fewer) — adds to any other movement grant */
  | { movement: number }
  /** Ranged N — the best range wins */
  | { ranged: number }
  /** "Water Spellcaster": casts spells of that element only */
  | { spellcasterElement: Element }
  /** "Air and Fire Spellcaster" (the Omphaloi): casts spells of any of these */
  | { spellcasterElements: Element[] }
  /** adds elements to the caster's element set (Vivien inheriting several locked spellcasters) */
  | { addSpellcasterElements: Element[] }
  /** "non-Fire Spellcaster": casts anything except that element (Wicker Manikin) */
  | { spellcasterExclude: Element }

/** Statuses that ride in a keyword modifier but are not abilities: they grant nothing, and are read where
 *  they matter (isDisabled, isUnmodifiable…). */
export type StatusMarker = 'disabled' | 'undisableable' | 'unsilenceable' | 'unimmobilizable'

/** what a keyword modifier carries */
export type ModifierKeyword = KeywordGrant | StatusMarker

/** a keyword that can be taken away ("loses Airborne", the editor's strip) */
export type KeywordKey = KeywordFlag | 'movement' | 'ranged'

const STATUS_MARKERS: ReadonlySet<string> = new Set<StatusMarker>(['disabled', 'undisableable', 'unsilenceable', 'unimmobilizable'])
const KEYWORD_FLAGS: ReadonlySet<string> = new Set<KeywordFlag>([
  'airborne', 'burrowing', 'submerge', 'voidwalk', 'charge', 'immobile', 'lethal', 'stealth', 'ward',
  'strikeFirst', 'lance', 'spellcaster', 'waterbound', 'landbound',
])
export const isStatusMarker = (k: ModifierKeyword): k is StatusMarker => typeof k === 'string' && STATUS_MARKERS.has(k)

/** add one grant to a keyword set */
export function applyGrant(kw: ParsedKeywords, g: ModifierKeyword): void {
  if (typeof g === 'string') {
    if (!STATUS_MARKERS.has(g)) kw[g as KeywordFlag] = true
    return
  }
  if ('movement' in g) kw.movement = (kw.movement ?? 0) + g.movement
  else if ('ranged' in g) kw.ranged = Math.max(kw.ranged ?? 0, g.ranged)
  else if ('spellcasterElement' in g) { kw.spellcaster = true; kw.spellcasterElement = g.spellcasterElement }
  else if ('spellcasterElements' in g) { kw.spellcaster = true; kw.spellcasterElements = [...g.spellcasterElements] }
  else if ('addSpellcasterElements' in g) {
    kw.spellcaster = true
    if (g.addSpellcasterElements.length) kw.spellcasterElements = [...new Set([...(kw.spellcasterElements ?? []), ...g.addSpellcasterElements])]
  } else if ('spellcasterExclude' in g) { kw.spellcaster = true; kw.spellcasterExclude = g.spellcasterExclude }
}

/** does this grant give the flag `key`? */
export function grantsFlag(g: ModifierKeyword, key: KeywordFlag): boolean {
  if (typeof g === 'string') return g === key
  return key === 'spellcaster' && !('movement' in g) && !('ranged' in g)
}

/** the keyword a grant is about — what stripping it removes */
export function keywordKeyOf(g: KeywordGrant): KeywordKey {
  if (typeof g === 'string') return g
  if ('movement' in g) return 'movement'
  if ('ranged' in g) return 'ranged'
  return 'spellcaster'
}

/** take a keyword away */
export function removeKeyword(kw: ParsedKeywords, key: KeywordKey): void {
  delete kw[key]
}

const FLAG_LABEL: Partial<Record<KeywordFlag, string>> = { strikeFirst: 'strike first' }
const cap = (e: string) => e[0].toUpperCase() + e.slice(1)
/** how a grant reads in the log / editor ("movement +1", "Water Spellcaster", "strike first") */
export function keywordLabel(g: ModifierKeyword): string {
  if (typeof g === 'string') return FLAG_LABEL[g as KeywordFlag] ?? g
  if ('movement' in g) return `movement ${g.movement >= 0 ? '+' : ''}${g.movement}`
  if ('ranged' in g) return `ranged ${g.ranged}`
  if ('spellcasterElement' in g) return `${cap(g.spellcasterElement)} Spellcaster`
  if ('spellcasterElements' in g) return `${g.spellcasterElements.map(cap).join(' and ')} Spellcaster`
  if ('addSpellcasterElements' in g) return `${g.addSpellcasterElements.map(cap).join('/')} Spellcaster`
  return `non-${cap(g.spellcasterExclude)} Spellcaster`
}

// ── saved data from before typed keywords ────────────────────────────────────────────────────────────
// Scenarios and replays saved by older versions carry keyword modifiers / editor ops as STRINGS. They are
// converted ONCE where saved data is loaded (migrateLegacyKeywords, the editor op) — the engine itself
// never reads keyword text during play. Covers every string the old code produced.
const ELEMENTS: ReadonlySet<string> = new Set(['air', 'earth', 'fire', 'water'])
const LEGACY_FLAGS: Record<string, KeywordFlag | StatusMarker> = {
  airborne: 'airborne', burrowing: 'burrowing', submerge: 'submerge', voidwalk: 'voidwalk', charge: 'charge',
  immobile: 'immobile', lethal: 'lethal', stealth: 'stealth', ward: 'ward', 'strike first': 'strikeFirst',
  lance: 'lance', spellcaster: 'spellcaster', waterbound: 'waterbound', landbound: 'landbound',
  disabled: 'disabled', undisableable: 'undisableable', unsilenceable: 'unsilenceable', unimmobilizable: 'unimmobilizable',
}
/** an old keyword STRING → its typed form (undefined: it never granted anything) */
export function legacyKeyword(s: string): ModifierKeyword | undefined {
  const low = s.trim().toLowerCase()
  if (LEGACY_FLAGS[low]) return LEGACY_FLAGS[low]
  const words = low.split(/\s+/)
  if (words[0] === 'movement' && words.length === 2 && Number.isFinite(Number(words[1]))) return { movement: Number(words[1]) }
  if (words[0] === 'ranged') return { ranged: words[1] !== undefined && Number.isFinite(Number(words[1])) ? Number(words[1]) : 1 }
  if (low.startsWith('spellcaster:')) return { addSpellcasterElements: low.slice(12).split(',').filter((e) => ELEMENTS.has(e)) as Element[] }
  if (words.at(-1) === 'spellcaster') {
    if (words.length === 2 && ELEMENTS.has(words[0])) return { spellcasterElement: words[0] as Element }
    if (words.length === 2 && words[0].startsWith('non-') && ELEMENTS.has(words[0].slice(4))) return { spellcasterExclude: words[0].slice(4) as Element }
    if (words.length === 4 && words[1] === 'and' && ELEMENTS.has(words[0]) && ELEMENTS.has(words[2])) return { spellcasterElements: [words[0] as Element, words[2] as Element] }
  }
  return undefined
}

/** a keyword from saved data: already typed (kept as is), or an old string (converted) */
export function toModifierKeyword(k: unknown): ModifierKeyword | undefined {
  if (typeof k === 'object' && k !== null) return k as ModifierKeyword
  if (typeof k !== 'string') return undefined
  if (KEYWORD_FLAGS.has(k) || STATUS_MARKERS.has(k)) return k as ModifierKeyword
  return legacyKeyword(k)
}

/** convert a saved state's string keyword modifiers in place (load boundary for old scenarios) */
export function migrateLegacyKeywords(state: { units?: Record<string, { modifiers?: { kind: string; keyword?: unknown }[] }> }): void {
  for (const u of Object.values(state.units ?? {})) {
    if (!u.modifiers) continue
    u.modifiers = u.modifiers.filter((m) => {
      if (m.kind !== 'keyword' || typeof m.keyword !== 'string') return true
      const k = toModifierKeyword(m.keyword)
      if (k === undefined) return false // it never granted anything
      m.keyword = k
      return true
    })
  }
}
