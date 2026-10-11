import { findCard, cardSupport } from '../cards/db'
import { getScript } from '../cards/scripts/registry'
import { isSuppliedSite, SEALED_SUPPLIED_AVATAR, SEALED_SUPPLIED_SITES } from '../cards/packs'

export interface DeckList {
  /** stable client-generated id (crypto.randomUUID). Survives renames; the key
   *  the account uses to store/update/delete this deck. Optional for legacy/
   *  starter decks (assigned on load). */
  id?: string
  name: string
  avatar: string
  /** card name → copies */
  spellbook: Record<string, number>
  atlas: Record<string, number>
  /** the deck's collection: cards outside the deck that its "from your
   *  collection" effects (Silver Bullet, Toolbox, Molten Maar…) may fetch.
   *  card name → copies; absent/empty = nothing to fetch. */
  collection?: Record<string, number>
  /** built in collection mode: only owned cards; ripping Erik's Curiosa is forever */
  fromCollection?: boolean
  /** per-card alternative art: card name → printing slug (e.g. "999-deathspeaker-op-rf"). Only cards whose
   *  art differs from the default (Beta) need an entry. Purely cosmetic; travels with the deck so the
   *  opponent sees the arts you actually chose. See printings.ts / CardImg. */
  art?: Record<string, string>
  /** the deck-list URL this deck was imported from (e.g. https://sorcerytcg.com/decks/<id>). Set on
   *  import; enables the deck builder's "🔄 Sync" button to re-import and match upstream changes. */
  source?: string
}

export const MIN_SPELLBOOK = 60
export const MIN_ATLAS = 30

const RARITY_LIMIT: Record<string, number> = {
  Ordinary: 4,
  Exceptional: 3,
  Elite: 2,
  Unique: 1,
}

export interface DeckProblem {
  level: 'error' | 'warning'
  msg: string
}

export function validateDeck(deck: DeckList): DeckProblem[] {
  const problems: DeckProblem[] = []
  const avatar = findCard(deck.avatar)
  if (!avatar) problems.push({ level: 'error', msg: `Unknown avatar: ${deck.avatar}` })
  else if (avatar.type !== 'Avatar') problems.push({ level: 'error', msg: `${deck.avatar} is not an Avatar` })
  else if (cardSupport(avatar) === 'unsupported') problems.push({ level: 'warning', msg: `${deck.avatar}'s special ability is not implemented (site ability still works)` })

  const avatarScript = getScript(deck.avatar)
  // Magician: sites go in the spellbook, the atlas stays empty
  const sitesOk = !!avatarScript?.sitesInSpellbook
  // Duplicator: only Uniques, in exactly matching pairs, in both decks
  const pairs = !!avatarScript?.pairsOfUniques

  let spellCount = 0
  for (const [name, copies] of Object.entries(deck.spellbook)) {
    spellCount += copies
    const def = findCard(name)
    if (!def) {
      problems.push({ level: 'error', msg: `Unknown card: ${name}` })
      continue
    }
    if ((def.type === 'Site' && !sitesOk) || def.type === 'Avatar') problems.push({ level: 'error', msg: `${name} cannot go in the spellbook` })
    if (pairs) {
      if (def.rarity !== 'Unique') problems.push({ level: 'error', msg: `${name}: Duplicator's decks may only contain Uniques` })
      else if (copies !== 2) problems.push({ level: 'error', msg: `${name}: Duplicator needs exactly a matching pair (2 copies)` })
    } else {
      const limit = getScript(name)?.deckLimitExempt ? Infinity : RARITY_LIMIT[def.rarity ?? ''] ?? 4
      if (copies > limit) problems.push({ level: 'error', msg: `${name}: max ${limit} copies (${def.rarity})` })
    }
    if (cardSupport(def) === 'unsupported') problems.push({ level: 'warning', msg: `${name} is not implemented by the engine yet` })
  }
  if (spellCount < MIN_SPELLBOOK) problems.push({ level: 'error', msg: `Spellbook has ${spellCount} cards; minimum is ${MIN_SPELLBOOK}` })

  let siteCount = 0
  for (const [name, copies] of Object.entries(deck.atlas)) {
    siteCount += copies
    const def = findCard(name)
    if (!def) {
      problems.push({ level: 'error', msg: `Unknown card: ${name}` })
      continue
    }
    if (def.type !== 'Site') problems.push({ level: 'error', msg: `${name} is not a Site` })
    if (pairs) {
      if (def.rarity !== 'Unique') problems.push({ level: 'error', msg: `${name}: Duplicator's decks may only contain Uniques` })
      else if (copies !== 2) problems.push({ level: 'error', msg: `${name}: Duplicator needs exactly a matching pair (2 copies)` })
    } else {
      const limit = avatarScript?.atlasNoDuplicates ? 1 : RARITY_LIMIT[def.rarity ?? ''] ?? 4
      if (copies > limit)
        problems.push({
          level: 'error',
          msg: limit === 1 ? `${name}: this avatar's atlas can't contain duplicates` : `${name}: max ${limit} copies (${def.rarity})`,
        })
    }
    if (cardSupport(def) === 'unsupported') problems.push({ level: 'warning', msg: `${name} is not implemented by the engine yet` })
  }
  if (sitesOk) {
    if (siteCount > 0) problems.push({ level: 'error', msg: `Magician has no atlas — put sites in the spellbook instead` })
  } else if (siteCount < MIN_ATLAS) problems.push({ level: 'error', msg: `Atlas has ${siteCount} cards; minimum is ${MIN_ATLAS}` })

  return problems
}

// ── Sealed / Limited deckbuilding ─────────────────────────────────────────────
// Different from Constructed: 1 avatar, ≥24 spellbook, ≥12 atlas, and NO rarity
// constraint. You may only use cards you opened (your `pool`), PLUS the Draft Kit
// supplied pool (unlimited basic Sites + the Spellslinger avatar).
export const MIN_SEALED_SPELLBOOK = 24
export const MIN_SEALED_ATLAS = 12

/** How many copies of `name` a Sealed player may use: unlimited for supplied basic
 *  Sites and the supplied avatar, otherwise however many they opened. */
export function sealedAvailable(name: string, pool: Record<string, number>): number {
  if (isSuppliedSite(name) || name === SEALED_SUPPLIED_AVATAR) return Infinity
  return pool[name] ?? 0
}

export function validateSealedDeck(deck: DeckList, pool: Record<string, number>): DeckProblem[] {
  const problems: DeckProblem[] = []
  const avatar = findCard(deck.avatar)
  if (!deck.avatar) problems.push({ level: 'error', msg: 'Pick an Avatar (the Spellslinger is supplied)' })
  else if (!avatar) problems.push({ level: 'error', msg: `Unknown avatar: ${deck.avatar}` })
  else if (avatar.type !== 'Avatar') problems.push({ level: 'error', msg: `${deck.avatar} is not an Avatar` })
  else if (sealedAvailable(deck.avatar, pool) < 1) problems.push({ level: 'error', msg: `You didn't open ${deck.avatar} — use the supplied Spellslinger or an Avatar from your pool` })

  const sitesOk = !!getScript(deck.avatar)?.sitesInSpellbook

  let spellCount = 0
  for (const [name, copies] of Object.entries(deck.spellbook)) {
    if (copies <= 0) continue
    spellCount += copies
    const def = findCard(name)
    if (!def) { problems.push({ level: 'error', msg: `Unknown card: ${name}` }); continue }
    if ((def.type === 'Site' && !sitesOk) || def.type === 'Avatar') problems.push({ level: 'error', msg: `${name} cannot go in the spellbook` })
    if (copies > sealedAvailable(name, pool)) problems.push({ level: 'error', msg: `${name}: you only opened ${pool[name] ?? 0}` })
    if (cardSupport(def) === 'unsupported') problems.push({ level: 'warning', msg: `${name} is not implemented by the engine yet` })
  }
  if (spellCount < MIN_SEALED_SPELLBOOK) problems.push({ level: 'error', msg: `Spellbook has ${spellCount} cards; minimum is ${MIN_SEALED_SPELLBOOK}` })

  let siteCount = 0
  for (const [name, copies] of Object.entries(deck.atlas)) {
    if (copies <= 0) continue
    siteCount += copies
    const def = findCard(name)
    if (!def) { problems.push({ level: 'error', msg: `Unknown card: ${name}` }); continue }
    if (def.type !== 'Site') problems.push({ level: 'error', msg: `${name} is not a Site` })
    if (copies > sealedAvailable(name, pool)) problems.push({ level: 'error', msg: `${name}: you only opened ${pool[name] ?? 0}` })
    if (cardSupport(def) === 'unsupported') problems.push({ level: 'warning', msg: `${name} is not implemented by the engine yet` })
  }
  if (sitesOk) {
    if (siteCount > 0) problems.push({ level: 'error', msg: `This avatar has no atlas — put sites in the spellbook instead` })
  } else if (siteCount < MIN_SEALED_ATLAS) problems.push({ level: 'error', msg: `Atlas has ${siteCount} cards; minimum is ${MIN_SEALED_ATLAS}` })

  return problems
}

/**
 * Bring a Sealed deck up to a legal-as-possible state from the player's `pool` — used
 * when the deckbuild timer expires before a player is Ready. Tops the spellbook to
 * MIN_SEALED_SPELLBOOK from leftover pool spells, the atlas to MIN_SEALED_ATLAS from
 * leftover pool Sites then the unlimited supplied basic Sites, defaults a missing
 * avatar to the Spellslinger, and rebuilds `collection` as everything left over.
 */
export function autofillSealedDeck(deck: DeckList, pool: Record<string, number>): DeckList {
  const spellbook: Record<string, number> = { ...deck.spellbook }
  const atlas: Record<string, number> = { ...deck.atlas }
  const avatar = deck.avatar && sealedAvailable(deck.avatar, pool) >= 1 ? deck.avatar : SEALED_SUPPLIED_AVATAR
  const sitesOk = !!getScript(avatar)?.sitesInSpellbook

  const count = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0)
  const remaining = (name: string, used: Record<string, number>) => sealedAvailable(name, pool) - (used[name] ?? 0)

  // top up the spellbook from leftover pool spells (Minions/Magics/Auras/Artifacts)
  if (!sitesOk) {
    for (const [name, have] of Object.entries(pool)) {
      if (count(spellbook) >= MIN_SEALED_SPELLBOOK) break
      const def = findCard(name)
      if (!def || def.type === 'Site' || def.type === 'Avatar') continue
      const add = Math.min(remaining(name, spellbook), MIN_SEALED_SPELLBOOK - count(spellbook))
      if (add > 0) spellbook[name] = (spellbook[name] ?? 0) + add
      void have
    }
  }

  // top up the atlas: leftover pool Sites first, then the unlimited supplied basics
  if (!sitesOk) {
    for (const [name, have] of Object.entries(pool)) {
      if (count(atlas) >= MIN_SEALED_ATLAS) break
      if (findCard(name)?.type !== 'Site') continue
      const add = Math.min(remaining(name, atlas), MIN_SEALED_ATLAS - count(atlas))
      if (add > 0) atlas[name] = (atlas[name] ?? 0) + add
      void have
    }
    for (let i = 0; count(atlas) < MIN_SEALED_ATLAS; i++) {
      const site = SEALED_SUPPLIED_SITES[i % SEALED_SUPPLIED_SITES.length]
      atlas[site] = (atlas[site] ?? 0) + 1
    }
  }

  // whatever pool cards weren't used become the Collection (fetch pool + "keep them")
  const collection: Record<string, number> = {}
  for (const [name, have] of Object.entries(pool)) {
    const used = (spellbook[name] ?? 0) + (atlas[name] ?? 0)
    const left = have - used
    if (left > 0) collection[name] = left
  }

  return { ...deck, avatar, spellbook, atlas, collection }
}

/** "3 Wild Boars" or "3x Wild Boars" lines; sections '# Avatar' / '# Spellbook' / '# Atlas' optional */
export function parseDeckText(name: string, text: string): DeckList {
  const deck: DeckList = { name, avatar: '', spellbook: {}, atlas: {} }
  let section: 'spellbook' | 'atlas' | 'avatar' | 'collection' | null = null
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const header = line.match(/^#+\s*(.+)$/) ?? line.match(/^(avatar|spellbook|atlas|sites?|collection)\s*:?\s*$/i)
    if (header) {
      const h = header[1].toLowerCase()
      section = h.startsWith('avatar') ? 'avatar'
        : h.startsWith('collection') ? 'collection'
        : h.startsWith('atlas') || h.startsWith('site') ? 'atlas'
        : 'spellbook'
      continue
    }
    const m = line.match(/^(\d+)\s*x?\s+(.+)$/)
    const copies = m ? Number(m[1]) : 1
    const cardName = (m ? m[2] : line).trim()
    const def = findCard(cardName)
    const type = def?.type
    if (section === 'collection') {
      // the collection may hold ANY card type, avatars included
      deck.collection = deck.collection ?? {}
      const nm = def?.name ?? cardName
      deck.collection[nm] = (deck.collection[nm] ?? 0) + copies
    } else if (section === 'avatar' || type === 'Avatar') {
      deck.avatar = def?.name ?? cardName
    } else if (section === 'atlas' || (!section && type === 'Site') || (section === null && type === 'Site')) {
      deck.atlas[def?.name ?? cardName] = (deck.atlas[def?.name ?? cardName] ?? 0) + copies
    } else if (type === 'Site') {
      deck.atlas[def!.name] = (deck.atlas[def!.name] ?? 0) + copies
    } else {
      deck.spellbook[def?.name ?? cardName] = (deck.spellbook[def?.name ?? cardName] ?? 0) + copies
    }
  }
  return deck
}

export function deckToText(deck: DeckList): string {
  const lines: string[] = [`# Avatar`, `1 ${deck.avatar}`, ``, `# Spellbook`]
  for (const [n, c] of Object.entries(deck.spellbook)) lines.push(`${c} ${n}`)
  lines.push('', '# Atlas')
  for (const [n, c] of Object.entries(deck.atlas)) lines.push(`${c} ${n}`)
  if (deck.collection && Object.keys(deck.collection).length) {
    lines.push('', '# Collection')
    for (const [n, c] of Object.entries(deck.collection)) lines.push(`${c} ${n}`)
  }
  return lines.join('\n')
}
