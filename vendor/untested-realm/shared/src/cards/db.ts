import rawCards from './cards.json'
import type { CardDef } from '../engine/types'

/**
 * The API dump prefixes errata'd cards with an "UPDATED:" marker on the first
 * line. It isn't part of the rules text and it breaks keyword parsing: a card
 * whose first line is a bare keyword (Pudge Butcher "UPDATED: Immobile",
 * Askelon Phoenix / Blood Ravens / Daperyll Vampire "UPDATED: Airborne") lost
 * that keyword entirely, because "updated: immobile" matches nothing. Strip the
 * marker at load so parseKeywords, census, and the UI all see the real text.
 */
function normalizeCardText(text: string | undefined): string {
  return (text ?? '').replace(/^\s*UPDATED\s*[:\-–]\s*/i, '')
}

// Most Avatars carry no rarity in the raw data. The physical sets DO rarity them, and
// booster packs contain Avatars of their edition, so fill the missing rarities here
// (canonically — used by pack generation AND the card detail UI). Only these Avatars are
// Unique; every other Avatar is Elite. (Rarities supplied from the real sets; Avatars
// that already carry a rarity — Dragonlord/Witch Unique, Templar Elite — are untouched.)
const UNIQUE_AVATARS = new Set<string>(['Magician', 'Realm-Eater', 'Duplicator', 'Imposter', 'Pathfinder'])
const normalizedCards: CardDef[] = (rawCards as CardDef[]).map((c) => {
  const card: CardDef = { ...c, text: normalizeCardText(c.text) }
  if (card.type === 'Avatar' && card.rarity == null) card.rarity = UNIQUE_AVATARS.has(card.name) ? 'Unique' : 'Elite'
  return card
})

const byName = new Map<string, CardDef>()
for (const c of normalizedCards) {
  // codex: "automatons are minions and artifacts" — minion characteristics
  // take precedence for behavior, so they live as units in the engine (the
  // API dump flattens their dual typeline to Artifact). Their artifact half
  // is honored by isArtifactUnit() wherever effects care about artifacts.
  if (c.type === 'Artifact' && c.subtypes?.includes('Automaton')) {
    byName.set(c.name.toLowerCase(), { ...c, type: 'Minion' })
  } else {
    byName.set(c.name.toLowerCase(), c)
  }
}

// ---- token definitions (never in decks, created by effects) ----
// Where the official set includes a printed token card, reuse its art & data.
function fromReal(realName: string, name: string, overrides: Partial<CardDef> = {}): CardDef {
  const base = byName.get(realName.toLowerCase())
  if (!base) {
    // fallback: bare text-only token
    return {
      name, type: 'Minion', rarity: 'Ordinary', cost: null, attack: 1, defence: 1, life: null,
      elements: [], subtypes: [], thresholds: { air: 0, earth: 0, fire: 0, water: 0 },
      text: '', sets: [], img: null, token: true, ...overrides,
    }
  }
  return { ...base, name, token: true, ...overrides }
}

// Tokens carry an EXPLICIT element even though they show no threshold symbols — the
// printed token cards are element-typed and the API dump drops that (it only records
// threshold pips, which tokens lack). Without it, element auras/effects (Crusade "earth
// minions +1", Jihad "fire", etc.) would never see them. So we set elements here.
const TOKENS: CardDef[] = [
  // Ordinary Mortal, power 1 (Beta printed token art) — Earth
  fromReal('Foot Soldier 1', 'Foot Soldier', { elements: ['Earth'] }),
  // Ordinary Beast, power 0, Submerge — Water (Submerge is a Water mechanic)
  fromReal('Frog (Green)', 'Frog', { attack: 0, defence: 0, elements: ['Water'] }),
  // Ordinary Undead, power 1, can't move to defend (real Gothic entry) — Air
  fromReal('Skeleton', 'Skeleton', { subtypes: ['Undead'], elements: ['Air'] }),
  // Spirit tokens have no printed card — text-only
  fromReal('__none__', 'Spirit', { attack: 1, defence: 1, subtypes: ['Spirit'], text: 'Airborne, Voidwalk' }),
]
for (const t of TOKENS) byName.set(t.name.toLowerCase(), t)
// 'Lance' and 'Rubble' printed cards already exist in the dataset under their exact names.

// ---- SITE TRAP reference card (see engine/traps.ts + gen/ember-ambush.ts) ----
// One example trap so the mechanic is exercisable end-to-end; the real traps ship with the
// Frostmage-vs-Lavamancer expansion. Like a token it lives in byName but NOT allCards, so it never
// enters the collectible pool / deckbuilder / boosters — it's a reference fixture, not a pack card.
const EXAMPLE_TRAPS: CardDef[] = [
  {
    name: 'Ember Ambush', type: 'Site', rarity: 'Ordinary', cost: null, attack: null, defence: null, life: null,
    elements: ['Fire'], subtypes: [], thresholds: { air: 0, earth: 0, fire: 1, water: 0 },
    text: 'Trap (disguised as a Wasteland). Spring: deal 3 damage to target nearby enemy.', sets: [], img: null,
  },
]
for (const t of EXAMPLE_TRAPS) byName.set(t.name.toLowerCase(), t)

export const allCards: CardDef[] = normalizedCards

export function getCard(name: string): CardDef {
  const c = byName.get(name.toLowerCase())
  if (!c) throw new Error(`Unknown card: ${name}`)
  return c
}

export function findCard(name: string): CardDef | undefined {
  return byName.get(name.toLowerCase())
}

// ---- keyword parsing ----

/** Keywords the engine implements natively. */
export interface ParsedKeywords {
  airborne?: boolean
  burrowing?: boolean
  submerge?: boolean
  voidwalk?: boolean
  charge?: boolean
  immobile?: boolean
  lethal?: boolean
  stealth?: boolean
  ward?: boolean
  strikeFirst?: boolean
  lance?: boolean
  spellcaster?: boolean
  /** element-restricted spellcaster, e.g. 'fire' */
  spellcasterElement?: string
  /** multi-element spellcaster — may cast a spell of ANY of these (the Omphaloi:
   *  "Air and Fire Spellcaster"). Supersedes spellcasterElement when present. */
  spellcasterElements?: string[]
  /** may cast anything EXCEPT this element (Wicker Manikin) */
  spellcasterExclude?: string
  movement?: number
  ranged?: number
  waterbound?: boolean
  landbound?: boolean
}

const SIMPLE_KEYWORDS: Record<string, keyof ParsedKeywords> = {
  airborne: 'airborne',
  burrowing: 'burrowing',
  submerge: 'submerge',
  voidwalk: 'voidwalk',
  charge: 'charge',
  immobile: 'immobile',
  lethal: 'lethal',
  stealth: 'stealth',
  ward: 'ward',
  'strike first': 'strikeFirst',
  lance: 'lance',
  spellcaster: 'spellcaster',
  waterbound: 'waterbound',
  landbound: 'landbound',
}

const ELEMENTS = ['air', 'earth', 'fire', 'water']

/** If `low` (a lower-cased, trimmed token) is an engine keyword, record it in `kw` and return true;
 *  otherwise leave `kw` untouched and return false. Shared by the whole-line keyword harvester. */
function applyKeywordToken(kw: ParsedKeywords, low: string): boolean {
  if (SIMPLE_KEYWORDS[low]) { (kw as any)[SIMPLE_KEYWORDS[low]] = true; return true }
  let m = low.match(/^movement \+(\d+)$/)
  if (m) { kw.movement = (kw.movement ?? 0) + Number(m[1]); return true }
  m = low.match(/^ranged(?: (\d+))?$/)
  if (m) { kw.ranged = m[1] ? Number(m[1]) : 1; return true }
  m = low.match(/^(air|earth|fire|water) spellcaster$/)
  if (m && ELEMENTS.includes(m[1])) { kw.spellcaster = true; kw.spellcasterElement = m[1]; return true }
  // multi-element spellcaster: "Air and Fire Spellcaster" (the Omphaloi)
  m = low.match(/^(air|earth|fire|water) and (air|earth|fire|water) spellcaster$/)
  if (m) { kw.spellcaster = true; kw.spellcasterElements = [m[1], m[2]]; return true }
  return false
}

/**
 * Parse a card's rules text into keywords. Returns the keywords found plus
 * whether the WHOLE text consists only of parseable keywords (→ the card is
 * fully engine-supported without a script).
 */
export function parseKeywords(text: string): { keywords: ParsedKeywords; fullyParsed: boolean } {
  const kw: ParsedKeywords = {}
  if (!text.trim()) return { keywords: kw, fullyParsed: true }
  let fullyParsed = true
  // A card's INNATE keywords are printed as a keyword CLAUSE — a leading run of keywords at the start of
  // a line, before any prose (Sorcery lists keywords first: "Airborne, can't attack or defend…", "Charge,
  // May carry an ally", or on their own line "…\n\nBurrowing, Submerge"). We harvest the leading run of
  // keyword tokens on EACH line and stop at the first prose token. So keyword WORDS that appear later
  // inside a sentence are ignored as descriptive — Ribble Boggart's "gains a random mutation…: Airborne,
  // Ranged, Lethal", Spire Lich's conditional "atop a Tower… Ranged", or "allies gain Charge" — while
  // real leading keywords and own-line keyword clauses are still picked up.
  for (const line of text.split('\n')) {
    let lead = true // still inside this line's leading keyword run
    for (const tok of line.split(/[,.;]/).map((t) => t.trim()).filter(Boolean)) {
      // apply to `kw` only while leading; once prose appears, later keyword-lookalikes go to a throwaway
      const isKeyword = applyKeywordToken(lead ? kw : {}, tok.toLowerCase())
      if (!isKeyword) { fullyParsed = false; lead = false }
    }
  }
  return { keywords: kw, fullyParsed }
}

/**
 * Memoized keyword lookup by card name. `parseKeywords` is a pure function of a
 * card's printed text and the text never changes at runtime, so we parse each
 * named card at most once and hand back a FROZEN result. Callers must spread
 * (`{ ...getKeywords(name) }`) before mutating. This keeps the runtime regex
 * out of hot per-unit loops (effKeywords, isDisabled) and cast-time paths.
 */
const keywordCache = new Map<string, ParsedKeywords>()
export function getKeywords(name: string): ParsedKeywords {
  const key = name.toLowerCase()
  let kw = keywordCache.get(key)
  if (!kw) {
    kw = Object.freeze(parseKeywords(getCard(name).text).keywords)
    keywordCache.set(key, kw)
  }
  return kw
}

// ---- support classification ----

export type Support = 'auto' | 'scripted' | 'unsupported'

/** names of scripted cards, populated by the scripts module to avoid a cycle */
export const scriptedNames = new Set<string>()

export function cardSupport(def: CardDef): Support {
  if (scriptedNames.has(def.name)) return 'scripted'
  if (def.type === 'Site' || def.type === 'Minion') {
    // keyword-only (or vanilla) sites and minions work without a script
    if (parseKeywords(def.text).fullyParsed) return 'auto'
  }
  if (def.type === 'Avatar') {
    // every avatar natively has "Tap → Play or draw a site"; extra text needs a script
    const stripped = def.text.replace(/tap\s*→\s*play or draw a site\.?/i, '').trim()
    if (!stripped) return 'auto'
  }
  return 'unsupported'
}
