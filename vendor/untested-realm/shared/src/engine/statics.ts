// Effective (computed) characteristics of units: keywords and power can be
// granted by printed text, modifiers, carried artifacts, and scripted statics.

import { getCard, findCard, getKeywords, type ParsedKeywords } from '../cards/db'
import { getScript, type AbilityDef } from '../cards/scripts/registry'
import type { GameState, UnitState, Region, PlayerId, AuraState, SiteState, ArtifactState, Thresholds } from './types'
import { siteAt, isWaterSite, nearbySquaresW, adjacentSquaresW, orthAdjacentWrapped, occupiedSquares, sitesOf } from './grid'

// ---- affinity ----
// A player's elemental threshold = everything they have "in play": controlled sites (with all the
// site modifiers — Drought/flood/Atlantean Fate/suppression/conditional provision), transformed
// sites walking as minions, "provides for everyone" sites under enemy control, and scripted bonuses
// (Elementalist/Cores/Vivien/judge/temp blooms). This is the single source of truth every
// threshold GATE must read — re-summing printed site thresholds by hand silently under-counts the
// bonus sources. Lives here (not casting.ts) so static/replacement gates in effects.ts & this file
// (Kor Crematory, Wormelow Tump) can reach it without an import cycle. Re-exported from casting.ts.
export function affinity(state: GameState, player: PlayerId): Thresholds {
  const total: Thresholds = { air: 0, earth: 0, fire: 0, water: 0 }
  // persistent judge override (manual scenario setup) — unlike tempThresh this is
  // never auto-wiped at end of turn; may be negative to shave affinity below the
  // sites' natural provision. Final total is clamped to ≥0 before returning.
  const jt = state.flow?.judgeThresh?.[player]
  if (jt) {
    total.air += jt.air ?? 0
    total.earth += jt.earth ?? 0
    total.fire += jt.fire ?? 0
    total.water += jt.water ?? 0
  }
  // one-turn boosts (Algae/Autumn/Desert Bloom, Annual Fair)
  const temp = state.flow?.tempThresh?.[player]
  if (temp) {
    total.air += temp.air ?? 0
    total.earth += temp.earth ?? 0
    total.fire += temp.fire ?? 0
    total.water += temp.water ?? 0
  }
  // transformed sites walking around as minions still provide their affinity
  // (Horns of Behemoth, Island Leviathan — FAQ: the golden rule)
  for (const u of Object.values(state.units)) {
    if (u.controller !== player || u.silenced) continue
    const def = getCard(u.name)
    if (def.type !== 'Site') continue
    total.air += def.thresholds.air
    total.earth += def.thresholds.earth
    total.fire += def.thresholds.fire
    total.water += def.thresholds.water
  }
  // sites that provide for everyone (Avalon), even under enemy control
  for (const site of Object.values(state.sites)) {
    if (site.isRubble || site.controller === player || site.controller === null) continue
    if (!getScript(site.name)?.providesForEveryone || siteDisabledByArtifact(state, site)) continue
    const th = getCard(site.name).thresholds
    // Drought dries even "provides for everyone" water sites — no water threshold while covered
    const dried = Object.values(state.auras).some(
      (r) => getScript(r.name)?.driesSites && r.squares.some((s) => s.x === site.x && s.y === site.y),
    )
    total.air += th.air
    total.earth += th.earth
    total.fire += th.fire
    total.water += dried ? 0 : th.water
  }
  for (const site of sitesOf(state, player)) {
    if (site.isRubble || siteDisabledByArtifact(state, site)) continue
    // conditional sites (Glastonbury Tor: back row only) and threshold
    // suppression by units atop (Granary Rats)
    const gate = getScript(site.name)?.siteProvides
    if (gate && !siteSilenced(state, site) && !gate(state, site)) continue
    const suppressed = Object.values(state.units).some(
      (u) =>
        (!u.silenced && u.x === site.x && u.y === site.y && getScript(u.name)?.suppressSiteThreshold) ||
        (!u.silenced && getScript(u.name)?.unitSuppressesSiteThreshold?.(state, u.id, site)),
    )
    if (suppressed) continue
    const th = getCard(site.name).thresholds
    // Drought: covered sites provide no water threshold (and no flood bonus)
    const dried = Object.values(state.auras).some(
      (r) => getScript(r.name)?.driesSites && r.squares.some((s) => s.x === site.x && s.y === site.y),
    )
    // Atlantean Fate: covered non-Ordinary sites only provide water
    const drowned = Object.values(state.auras).some(
      (r) => getScript(r.name)?.auraLimitsToWaterThreshold &&
        getCard(site.name).rarity !== 'Ordinary' &&
        r.squares.some((s) => s.x === site.x && s.y === site.y),
    )
    total.air += drowned ? 0 : th.air
    total.earth += drowned ? 0 : th.earth
    total.fire += drowned ? 0 : th.fire
    total.water += dried ? 0 : th.water
    if (!dried && site.flooded && th.water === 0) total.water += 1
    // per-instance extra threshold (Valley of Delight, Sow the Earth)
    const extraTh = getScript(site.name)?.siteExtraThreshold?.(state, site)
    if (extraTh) {
      total.air += extraTh.air ?? 0
      total.earth += extraTh.earth ?? 0
      total.fire += extraTh.fire ?? 0
      total.water += extraTh.water ?? 0
    }
    for (const r of Object.values(state.auras)) {
      const more = getScript(r.name)?.auraSiteExtraThreshold?.(state, r, site)
      if (more) {
        total.air += more.air ?? 0
        total.earth += more.earth ?? 0
        total.fire += more.fire ?? 0
        total.water += more.water ?? 0
      }
    }
  }
  // scripted affinity bonuses (avatars like Elementalist, elemental Cores...)
  const addBonus = (bonus?: Partial<Thresholds>) => {
    if (!bonus) return
    total.air += bonus.air ?? 0
    total.earth += bonus.earth ?? 0
    total.fire += bonus.fire ?? 0
    total.water += bonus.water ?? 0
  }
  for (const unit of Object.values(state.units)) {
    // a disabled source has no abilities → provides no affinity
    if (unit.controller === player && !unit.silenced && !disabledByEffect(state, unit)) {
      // a masked Imposter provides its MASK's affinity bonus (Elementalist → +🜁🜃🜂🜄). affinityBonus is a
      // data field read by name, so unlike the function hooks it isn't auto-forwarded through the mask.
      const effName = unit.name === 'Imposter' ? state.flow?.imposterMask?.[unit.controller] ?? unit.name : unit.name
      addBonus(getScript(effName)?.affinityBonus)
      // Vivien has "the printed abilities of all Avatars and Spellcasters in the realm", so she also
      // provides their affinityBonus (an Elementalist avatar → +🜁🜃🜂🜄 for VIVIEN's controller, even
      // when the Elementalist belongs to the opponent). Same data-field-not-a-hook gap as the Imposter:
      // her ability-copying hooks forward functions, but affinityBonus is read by name. Dedup by source
      // name (each printed ability once, however many copies are in play); a silenced/disabled source
      // has no abilities to lend.
      if (unit.name === 'Vivien the Enchantress') {
        const seen = new Set<string>()
        for (const src of Object.values(state.units)) {
          if (src.id === unit.id || src.silenced || src.name === 'Vivien the Enchantress' || seen.has(src.name)) continue
          if (disabledByEffect(state, src)) continue
          if (!src.isAvatar && !effKeywords(state, src).spellcaster) continue
          seen.add(src.name)
          addBonus(getScript(src.name)?.affinityBonus)
        }
      }
    }
  }
  for (const art of Object.values(state.artifacts)) {
    const controller = art.carriedBy ? state.units[art.carriedBy]?.controller : art.conjuredBy
    if (controller === player) addBonus(artScript(state, art)?.affinityBonus) // silenced artifact grants no affinity
  }
  // a negative judge override (or any future negative source) can't drop affinity
  // below zero — thresholds are natural numbers.
  total.air = Math.max(0, total.air)
  total.earth = Math.max(0, total.earth)
  total.fire = Math.max(0, total.fire)
  total.water = Math.max(0, total.water)
  return total
}

/** is this site's rules text turned off? (Leadworks, Smokestacks of Gnaak) */
/** A "carriable artifact" is one whose printed subtypes include NEITHER 'Monument' NOR
 *  'Automaton' — the only artifacts a Mimic may transform into. */
export function isCarriableArtifact(name: string): boolean {
  const st = getCard(name).subtypes
  return !st.includes('Monument') && !st.includes('Automaton')
}

/** Haystack: an enemy site caps how deep this player may search decks */
export function searchLimit(state: GameState, player: PlayerId): number {
  let lim = Infinity
  for (const s of Object.values(state.sites)) {
    const n = getScript(s.name)?.limitsEnemySearches
    if (n && !s.isRubble && s.controller !== null && s.controller !== player && !siteSilenced(state, s)) {
      lim = Math.min(lim, n)
    }
  }
  return lim
}

/** Bureau of Occult Control: mana toll to access a collection or cemetery */
export function zoneAccessToll(state: GameState): number {
  let toll = 0
  for (const s of Object.values(state.sites)) {
    const n = getScript(s.name)?.zoneAccessToll
    if (n && !s.isRubble && s.controller !== null && !siteSilenced(state, s)) toll += n
  }
  return toll
}

/** Wormelow Tump: with (E)(E)(E), opponents can't affect cards in this player's cemetery */
export function cemeteryProtected(state: GameState, owner: PlayerId, actor: PlayerId | null): boolean {
  if (actor === null || actor === owner) return false
  for (const site of Object.values(state.sites)) {
    if (site.name !== 'Wormelow Tump' || site.isRubble || site.controller !== owner || siteSilenced(state, site)) continue
    // (E)(E)(E) is a true-affinity gate (Tump's own Earth plus Elementalist/Cores/blooms), not just printed Earth on sites.
    if (affinity(state, owner).earth >= 3) return true
  }
  return false
}

/** Legion of Gall: card names banished from a player's collection */
export function collectionBanned(state: GameState, player: PlayerId, name: string): boolean {
  return ((state.flow?.collectionBans?.[player] ?? []) as string[]).includes(name)
}

/** pay the zone-access toll if affordable; false means the vault stays shut */
export function payZoneToll(state: GameState, player: PlayerId): boolean {
  const toll = zoneAccessToll(state)
  if (!toll) return true
  const p = state.players[player]
  if (p.mana < toll) return false
  p.mana -= toll
  // count toward spent-this-turn (inline to avoid a statics↔effects import cycle)
  state.flow = state.flow ?? {}
  state.flow.manaSpent = state.flow.manaSpent ?? { 0: 0, 1: 0 }
  state.flow.manaSpent[player] = (state.flow.manaSpent[player] ?? 0) + toll
  return true
}

/** is this square void? (no site, or a site that is "also void" like The Void) */
export function isVoidAt(state: GameState, x: number, y: number): boolean {
  const site = siteAt(state, x, y)
  if (!site) return true
  return !!getScript(site.name)?.siteAlsoVoid && !siteSilenced(state, site)
}

export function siteSilenced(state: GameState, site: { x: number; y: number }): boolean {
  // Bedrock "can't be modified" — it can't be silenced or lose its abilities (FAQ).
  const here = Object.values(state.sites).find((s) => s.x === site.x && s.y === site.y && !s.isRubble)
  if (here && getScript(here.name)?.unmodifiableSite) return false
  for (const ss of (state.flow?.siteSilences ?? []) as { siteId: string }[]) {
    const src = state.sites[ss.siteId]
    if (src && nearbySquaresW(state, src.x, src.y).some((q) => q.x === site.x && q.y === site.y)) return true
  }
  for (const src of Object.values(state.sites)) {
    if (src.isRubble || (src.x === site.x && src.y === site.y)) continue // never itself
    const script = getScript(src.name)
    if (script?.silencesNearbySites && nearbySquaresW(state, src.x, src.y).some((q) => q.x === site.x && q.y === site.y)) return true
    if (script?.silencesSiteAt && script.silencesSiteAt(state, src, site)) return true
  }
  // units that silence specific sites (Sinterfee)
  for (const u of Object.values(state.units)) {
    if (u.silenced || disabledByEffect(state, u)) continue // disabled → no abilities
    const f = getScript(u.name)?.unitSilencesSiteAt
    if (f && f(state, u.id, site as { id: string; x: number; y: number })) return true
  }
  // auras that silence covered sites: `true` silences every covered site (Acid Rain); a predicate
  // silences only the sites it accepts (Atlantean Fate silences its non-Ordinary sites only).
  for (const r of Object.values(state.auras)) {
    const f = getScript(r.name)?.auraSilencesSites
    if (!f || !r.squares.some((q) => q.x === site.x && q.y === site.y)) continue
    if (f === true) return true
    const full = siteAt(state, site.x, site.y)
    if (typeof f === 'function' && full && f(state, full)) return true
  }
  return false
}

/** artifacts hushed by an aura lose their text (Acid Rain) */
export function artifactSilenced(state: GameState, art: { x: number; y: number; carriedBy?: string | null }): boolean {
  const x = art.carriedBy ? state.units[art.carriedBy]?.x ?? art.x : art.x
  const y = art.carriedBy ? state.units[art.carriedBy]?.y ?? art.y : art.y
  for (const r of Object.values(state.auras)) {
    if (getScript(r.name)?.auraSilencesArtifacts && r.squares.some((q) => q.x === x && q.y === y)) return true
  }
  return false
}

/** An artifact's script, or undefined when the artifact is SILENCED. A silenced artifact loses ALL its
 *  text/abilities — it just sits there (still carriable if it was, still targetable/destructible). Use
 *  this instead of getScript(art.name) for every PASSIVE/STATIC artifact effect so silence disables them
 *  uniformly. (Activated artifact abilities are already gated in canActivate. Automatons are UNITS in
 *  state.units, NOT entries in state.artifacts, so a silenced Automaton still moves / attacks / taps for
 *  costs like any silenced minion — this never touches them.) */
export function artScript(state: GameState, art: { name: string; x: number; y: number; carriedBy?: string | null }): ReturnType<typeof getScript> {
  return artifactSilenced(state, art) ? undefined : getScript(art.name)
}

/** an artifact sitting on this site turns it off entirely (Blightstone) */
export function siteDisabledByArtifact(state: GameState, site: { x: number; y: number }): boolean {
  return Object.values(state.artifacts).some(
    (a) => !a.carriedBy && a.x === site.x && a.y === site.y && a.region === 'surface' && getScript(a.name)?.disablesSite && !artifactSilenced(state, a),
  )
}

/** A double-faced card flipped to a side it doesn't have (Vivien borrowing the
 *  Druid's flip) is BLANKED: no rules text, no keywords, no abilities, and — being
 *  no longer a minion — it can't act. Only cards WITHOUT a defined `flipText` blank
 *  this way; a real double-face (the Druid) keeps its back script. FAQ: it still
 *  exists (occupies its square, sits in the void, is hit by Roots of Yggdrasil). */
export function isBlanked(unit: UnitState): boolean {
  return !!unit.flipped && !findCard(unit.name)?.flipText
}

// Re-entrancy guard for the disable check below: disabledByEffect may (transitively, via a disabler's
// power/condition logic) call effKeywords again. While one disable check is in flight, a nested
// effKeywords skips its own disable check (returns keywords un-stripped) so the cycle can't loop.
let inDisableCheck = false
export function effKeywords(state: GameState, unit: UnitState, seen: Set<string> = new Set()): ParsedKeywords {
  if (unit.silenced || isBlanked(unit) || seen.has(unit.id)) return {}
  // A DISABLED minion has NO abilities — including basic keyword abilities (Airborne, Burrowing,
  // Submerge, Voidwalk, Ranged, Charge, Stealth, Ward, Spellcaster, Strike-first, Lethal…). Same
  // blanket wipe as silence — so a disabled subsurface unit even loses Burrowing/Submerge and
  // drowns/suffocates via canExistIn (intended). The re-entrancy guard breaks any
  // disabledByEffect→…→effKeywords cycle (a nested call sees keywords un-stripped).
  if (!unit.isAvatar && !inDisableCheck) {
    inDisableCheck = true
    let dis = false
    try { dis = disabledByEffect(state, unit) } finally { inDisableCheck = false }
    if (dis) return {}
  }
  seen.add(unit.id)
  const kw: ParsedKeywords = { ...getKeywords(unit.name) }
  if (unit.isAvatar) kw.spellcaster = true
  for (const mod of unit.modifiers) {
    if (mod.kind === 'keyword' && mod.keyword && !mod.remove) applyKeywordString(kw, mod.keyword)
  }
  // a carrier confers its movement-region abilities to what it carries
  if (unit.carriedBy) {
    const carrier = state.units[unit.carriedBy]
    if (carrier) {
      const ckw = effKeywords(state, carrier, seen)
      if (ckw.airborne) kw.airborne = true
      if (ckw.burrowing) kw.burrowing = true
      if (ckw.submerge) kw.submerge = true
      if (ckw.voidwalk) kw.voidwalk = true
    }
  }
  // carried artifacts granting keywords to the bearer
  for (const artId of unit.carrying) {
    const art = state.artifacts[artId]
    if (!art) continue
    const script = getScript(art.name)
    if (script?.bearerKeywords) {
      for (const k of script.bearerKeywords) applyKeywordString(kw, k)
    }
  }
  // self-granted conditional keywords (Realm-Eater's post-meal torpor)
  const selfKw = getScript(unit.name)?.selfKeywords
  if (selfKw) for (const k of selfKw(state, unit)) applyKeywordString(kw, k)
  // (Evil Twin's strike-first is NOT a blanket keyword: it applies only when the
  // twin fights the minion it copied — handled target-aware in combat.ts.)
  // scripted global/static keyword grants
  for (const grant of collectStaticGrants(state, unit)) applyKeywordString(kw, grant)
  // removal layer LAST — strips beat grants (Sky Baron, Entangle Terrain)
  for (const gone of collectKeywordRemovals(state, unit)) removeKeywordString(kw, gone)
  // editor-applied negative keyword modifiers strip too (after every grant layer)
  for (const mod of unit.modifiers) {
    if (mod.kind === 'keyword' && mod.keyword && mod.remove) removeKeywordString(kw, mod.keyword)
  }
  // "can't be immobilized" (Gossamer Ghost, an unmodifiable unit, or an Onslaught grant) strips the
  // Immobile keyword itself — printed OR granted — so the unit may move. Centralised here so every
  // reader of kw.immobile (movement legality, the bot, the UI) honours the immunity at once.
  if (kw.immobile && immobilizeImmune(state, unit)) delete kw.immobile
  // rulebook: "Evil minions can't be warded" — a keyword-granted ward on an Evil
  // minion is void too (an Evil AVATAR is not a minion, so it keeps its ward).
  // isEvilUnit → effSubtypes only (no subtype hook calls effKeywords), so no
  // recursion; the `seen` guard above already covers the carrier path regardless.
  if (kw.ward && !unit.isAvatar && isEvilUnit(state, unit)) delete kw.ward
  return kw
}

function removeKeywordString(kw: ParsedKeywords, keyword: string): void {
  const low = keyword.toLowerCase()
  const map: Record<string, keyof ParsedKeywords> = {
    airborne: 'airborne', burrowing: 'burrowing', submerge: 'submerge', voidwalk: 'voidwalk',
    charge: 'charge', lethal: 'lethal', stealth: 'stealth', ward: 'ward',
    'strike first': 'strikeFirst', spellcaster: 'spellcaster', ranged: 'ranged',
    movement: 'movement', immobile: 'immobile',
  }
  // tolerate parametric forms ("ranged 1", "movement +1") by falling back to the base word
  const key = map[low] ?? map[low.split(/\s+/)[0]]
  if (key) delete (kw as any)[key]
}

function collectKeywordRemovals(state: GameState, unit: UnitState): string[] {
  const out: string[] = []
  const src = removeSources(state) // index-driven (small); same iteration/gating as before
  for (const other of src.units) {
    if (other.silenced || disabledByEffect(state, other)) continue // disabled → strips nothing
    const f = getScript(other.name)?.removesKeywords
    if (f) out.push(...f(state, other.id, unit))
  }
  for (const s of src.sites) {
    if (s.controller === null || s.isRubble || siteSilenced(state, s)) continue
    const f = getScript(s.name)?.removesKeywords
    if (f) out.push(...f(state, s.id, unit))
  }
  for (const a of src.arts) {
    const f = artScript(state, a)?.removesKeywords // a silenced artifact removes nothing
    if (f) out.push(...f(state, a.id, unit))
  }
  for (const r of src.auras) {
    const f = getScript(r.name)?.removesKeywords
    if (f) out.push(...f(state, r.id, unit))
  }
  return out
}

export function applyKeywordString(kw: ParsedKeywords, keyword: string) {
  const low = keyword.toLowerCase()
  // "movement +N" grants steps; "movement -N" (editor / debuffs) takes them away
  const m = low.match(/^movement ([+-]\d+)$/)
  if (m) {
    kw.movement = (kw.movement ?? 0) + Number(m[1])
    return
  }
  const r = low.match(/^ranged(?: (\d+))?$/)
  if (r) {
    kw.ranged = Math.max(kw.ranged ?? 0, r[1] ? Number(r[1]) : 1)
    return
  }
  const sc = low.match(/^(air|earth|fire|water) spellcaster$/)
  if (sc) {
    kw.spellcaster = true
    kw.spellcasterElement = sc[1]
    return
  }
  const msc = low.match(/^(air|earth|fire|water) and (air|earth|fire|water) spellcaster$/)
  if (msc) {
    kw.spellcaster = true
    kw.spellcasterElements = [msc[1], msc[2]]
    return
  }
  // arbitrary element-set spellcaster grant (Vivien inheriting several locked spellcasters):
  // "spellcaster:air,fire,water" → a spellcaster restricted to those elements.
  const scset = low.match(/^spellcaster:([a-z,]+)$/)
  if (scset) {
    kw.spellcaster = true
    const els = scset[1].split(',').filter((e) => ['air', 'earth', 'fire', 'water'].includes(e))
    if (els.length) kw.spellcasterElements = [...new Set([...(kw.spellcasterElements ?? []), ...els])]
    return
  }
  const nsc = low.match(/^non-(air|earth|fire|water) spellcaster$/)
  if (nsc) {
    kw.spellcaster = true
    kw.spellcasterExclude = nsc[1]
    return
  }
  const map: Record<string, keyof ParsedKeywords> = {
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
    spellcaster: 'spellcaster',
    waterbound: 'waterbound',
    landbound: 'landbound',
  }
  if (map[low]) (kw as any)[map[low]] = true
}

// ── static GRANT / REMOVE source index ────────────────────────────────────────────────────────────
// effKeywords/powerModifiers/collectKeywordRemovals run per-unit in hot loops (movement, combat, bot).
// A full board scan there is O(units·sources) — the profiled hot spot. checkStateBased maintains this
// small index of the entities that actually own a grant/remove hook; the consumers iterate ONLY those,
// with a gen-stamp guard (state.nextId) + a full-scan fallback, EXACTLY like disablerIndex. Grant units
// exclude `selfGrantOnly` cards (their effect is applied via the direct self-eval in the consumers), so
// a board of vanilla minions + self-conditional cards (Angel Ascendant, …) costs O(1) here.
export interface StaticGrantIndex {
  gen: number
  gUnits: string[]; gAuras: string[]; gSites: string[]; gArts: string[] // grant sources (units exclude selfGrantOnly)
  rUnits: string[]; rSites: string[]; rArts: string[]; rAuras: string[] // keyword-removal sources
}
const isGrantUnit = (s: ReturnType<typeof getScript>): boolean => !!(s && (s.grantsKeywords || s.grantsPower) && !s.selfGrantOnly)
export function buildStaticGrantIndex(state: GameState): StaticGrantIndex {
  const gUnits: string[] = [], gAuras: string[] = [], gSites: string[] = [], gArts: string[] = []
  const rUnits: string[] = [], rSites: string[] = [], rArts: string[] = [], rAuras: string[] = []
  for (const u of Object.values(state.units)) {
    const s = getScript(u.name)
    if (isGrantUnit(s)) gUnits.push(u.id)
    if (s?.removesKeywords) rUnits.push(u.id)
  }
  for (const a of Object.values(state.auras)) {
    const s = getScript(a.name)
    if (s && (s.auraGrantsKeywords || s.auraGrantsPower)) gAuras.push(a.id)
    if (s?.removesKeywords) rAuras.push(a.id)
  }
  for (const st of Object.values(state.sites)) {
    const s = getScript(st.name)
    if (s && (s.siteGrantsKeywords || s.siteGrantsPower)) gSites.push(st.id)
    if (s?.removesKeywords) rSites.push(st.id)
  }
  for (const art of Object.values(state.artifacts)) {
    const s = getScript(art.name)
    if (s && (s.artifactGrantsKeywords || s.artifactGrantsPower)) gArts.push(art.id)
    if (s?.removesKeywords) rArts.push(art.id)
  }
  return { gen: state.nextId, gUnits, gAuras, gSites, gArts, rUnits, rSites, rArts, rAuras }
}
const pickAll = <T>(coll: Record<string, T>, ids: string[]): T[] => {
  const out: T[] = []
  for (const id of ids) { const e = coll[id]; if (e) out.push(e) } // filter removed (id survives until next rebuild)
  return out
}
/** the entities that GRANT keywords/power, via the index when its gen stamp is current, else a full scan. */
function grantSources(state: GameState): { units: UnitState[]; auras: AuraState[]; sites: SiteState[]; arts: ArtifactState[] } {
  const ix = state.flow?.staticGrantIndex as StaticGrantIndex | undefined
  if (ix && ix.gen === state.nextId) {
    return { units: pickAll(state.units, ix.gUnits), auras: pickAll(state.auras, ix.gAuras), sites: pickAll(state.sites, ix.gSites), arts: pickAll(state.artifacts, ix.gArts) }
  }
  return {
    units: Object.values(state.units).filter((u) => isGrantUnit(getScript(u.name))),
    auras: Object.values(state.auras).filter((a) => { const s = getScript(a.name); return !!(s && (s.auraGrantsKeywords || s.auraGrantsPower)) }),
    sites: Object.values(state.sites).filter((st) => { const s = getScript(st.name); return !!(s && (s.siteGrantsKeywords || s.siteGrantsPower)) }),
    arts: Object.values(state.artifacts).filter((a) => { const s = getScript(a.name); return !!(s && (s.artifactGrantsKeywords || s.artifactGrantsPower)) }),
  }
}
/** the entities that REMOVE keywords, via the index when current, else a full scan. */
function removeSources(state: GameState): { units: UnitState[]; sites: SiteState[]; arts: ArtifactState[]; auras: AuraState[] } {
  const ix = state.flow?.staticGrantIndex as StaticGrantIndex | undefined
  if (ix && ix.gen === state.nextId) {
    return { units: pickAll(state.units, ix.rUnits), sites: pickAll(state.sites, ix.rSites), arts: pickAll(state.artifacts, ix.rArts), auras: pickAll(state.auras, ix.rAuras) }
  }
  return {
    units: Object.values(state.units).filter((u) => !!getScript(u.name)?.removesKeywords),
    sites: Object.values(state.sites).filter((s) => !!getScript(s.name)?.removesKeywords),
    arts: Object.values(state.artifacts).filter((a) => !!getScript(a.name)?.removesKeywords),
    auras: Object.values(state.auras).filter((a) => !!getScript(a.name)?.removesKeywords),
  }
}

function collectStaticGrants(state: GameState, unit: UnitState): string[] {
  const out: string[] = []
  // "Can't be modified" (Monks of Kobalsa, Bedrock…): the unit can't GAIN abilities from external
  // sources. It keeps only its OWN self-grants (Angel Ascendant's Airborne-while-warded).
  const unmod = isUnmodifiable(state, unit)
  // (1) the unit's OWN self-grant. effKeywords has already returned {} if the unit is
  // silenced/blanked/disabled, so the self-grant needs no extra gating here. A self-only granter's
  // WHOLE effect lives here; a mixed granter (Rebecks) applies its self-portion here too.
  const selfScript = getScript(unit.name)
  if (selfScript?.grantsKeywords) for (const g of selfScript.grantsKeywords(state, unit, unit)) out.push(g)
  if (unmod) return out // auras/sites/artifacts/other units are all external — an unmodifiable unit ignores them
  // (2) cross-unit grants from OTHER entities (self handled above → skip it).
  const src = grantSources(state)
  for (const other of src.units) {
    if (other.id === unit.id || other.silenced || disabledByEffect(state, other)) continue
    const g = getScript(other.name)?.grantsKeywords
    if (g) for (const k of g(state, other, unit)) out.push(k)
  }
  for (const aura of src.auras) {
    const g = getScript(aura.name)?.auraGrantsKeywords
    if (g) for (const k of g(state, aura, unit)) out.push(k)
  }
  const deafToSites =
    unit.carrying.some((id) => getScript(state.artifacts[id]?.name ?? '')?.bearerIgnoresSites) ||
    (!!getScript(unit.name)?.ignoresSites && !unit.silenced)
  if (!deafToSites) for (const site of src.sites) { // Key to the City: the bearer ignores site abilities
    const g = getScript(site.name)?.siteGrantsKeywords
    if (g && !siteSilenced(state, site)) for (const k of g(state, site, unit)) out.push(k)
  }
  for (const art of src.arts) {
    const g = getScript(art.name)?.artifactGrantsKeywords
    if (g && !artifactSilenced(state, art)) for (const k of g(state, art.id, unit)) out.push(k)
  }
  return out
}

/** attack power (strike damage) */
export function effAttack(state: GameState, unit: UnitState): number {
  const def = getCard(unit.name)
  let atk = def.attack ?? 0
  atk += powerModifiers(state, unit)
  return Math.max(0, atk)
}

/** defense power (damage needed to die) */
export function effDefence(state: GameState, unit: UnitState): number {
  const def = getCard(unit.name)
  let d = def.defence ?? def.attack ?? 0
  d += powerModifiers(state, unit)
  return Math.max(0, d)
}

function powerModifiers(state: GameState, unit: UnitState): number {
  let n = 0
  // NB: power MODIFIERS (addPower) are already prevented for unmodifiable units at their source, so
  // this loop is empty for them; selfPower is the unit's own characteristic and always applies.
  for (const mod of unit.modifiers) if (mod.kind === 'power') n += mod.amount ?? 0
  // condition-driven own power (Megamoeba's mass, Aethermoeba's hollows). A CHARACTERISTIC — survives
  // disable (only gated by silence), unlike a granted-ability power below.
  const own = getScript(unit.name)?.selfPower
  if (own && !unit.silenced) n += own(state, unit)
  // "Can't be modified" (Monks of Kobalsa, Bedrock…): its power is a characteristic that no EXTERNAL
  // source — equipment, lords, auras, sites — can change. Only its own self-power counts.
  const unmod = isUnmodifiable(state, unit)
  // the unit's OWN conditional grantsPower (Angel Ascendant "+1 while Warded") is an ABILITY — it must
  // be lost on disable/silence, so gate it exactly as the old self-iteration did. (Self-only granters'
  // whole power effect lives here; the cross-unit loop below then skips self, avoiding a double count.)
  const selfScript = getScript(unit.name)
  if (selfScript?.grantsPower && !unit.silenced && !disabledByEffect(state, unit)) n += selfScript.grantsPower(state, unit, unit)
  if (unmod) return n // no carried/other/aura/site power — external sources can't change its power
  for (const artId of unit.carrying) {
    const art = state.artifacts[artId]
    if (!art) continue
    const script = getScript(art.name)
    if (script?.bearerPower) n += script.bearerPower
    if (script?.bearerPowerFn) n += script.bearerPowerFn(state, artId, unit)
  }
  const src = grantSources(state)
  for (const other of src.units) {
    // a silenced OR disabled source has no abilities, so its power static is off; self already applied.
    if (other.id === unit.id || other.silenced || disabledByEffect(state, other)) continue
    const g = getScript(other.name)?.grantsPower
    if (g) n += g(state, other, unit)
  }
  for (const aura of src.auras) {
    const g = getScript(aura.name)?.auraGrantsPower
    if (g) n += g(state, aura, unit)
  }
  for (const art of src.arts) {
    const g = getScript(art.name)?.artifactGrantsPower
    if (g && !artifactSilenced(state, art)) n += g(state, art.id, unit)
  }
  const unitDeafToSites =
    unit.carrying.some((id) => getScript(state.artifacts[id]?.name ?? '')?.bearerIgnoresSites) ||
    (!!getScript(unit.name)?.ignoresSites && !unit.silenced)
  if (!unitDeafToSites) for (const site of src.sites) {
    const g = getScript(site.name)?.siteGrantsPower
    if (g && !siteSilenced(state, site)) n += g(state, site, unit)
  }
  return n
}

export type Terrain = 'water' | 'land' | 'void'

export function terrainAt(state: GameState, x: number, y: number): Terrain {
  const site = siteAt(state, x, y)
  if (!site) return 'void'
  // Drought: affected sites aren't water sites
  for (const r of Object.values(state.auras)) {
    if (getScript(r.name)?.driesSites && r.squares.some((s) => s.x === x && s.y === y)) return 'land'
  }
  return isWaterSite(state, site, getCard) ? 'water' : 'land'
}

/** A placed site's effective rarity. RUBBLE is Ordinary — a destroyed site has lost its identity (it
 *  provides no mana or abilities), so every rarity-gated effect (Castle Haunt / Castle's & Hamlet's
 *  Ablaze / Heirloom Lost) must read it as Ordinary, not the destroyed card's printed rarity. Use this
 *  instead of getCard(site.name).rarity whenever classifying a site IN PLAY. */
export function siteRarity(state: GameState, site: SiteState): string {
  if (site.isRubble) return 'Ordinary'
  return getCard(site.name).rarity ?? 'Ordinary'
}

/** For a FORCED region change (Bury/Drown/Cave-In/flood submerge), an OVERSIZED unit
 *  must occupy a single uniform terrain: the rulebook says the effect FAILS unless the
 *  oversized unit occupies only water sites, or only land sites. Returns true iff every
 *  square the unit currently occupies has `terrain`. For a 1x1 unit this is just its own
 *  square, so it never changes normal-minion behavior. */
export function footprintAllTerrain(state: GameState, unit: UnitState, terrain: Terrain): boolean {
  return occupiedSquares(unit).every((s) => terrainAt(state, s.x, s.y) === terrain)
}

/** Does a projectile's travel region EXIST at (x,y)? A projectile "travels within
 *  the same region… until it reaches the edge of its region" (rulebook). A void
 *  square (no site) is its own region — it has neither surface nor subsurface — so
 *  a surface / underground / underwater projectile STOPS when it reaches one; it
 *  does not cross the void. (Area effects like Cone of Flame are unaffected: they
 *  template over squares and merely ignore voids, they don't travel a path.) */
export function regionPresentAt(state: GameState, region: Region, x: number, y: number): boolean {
  const t = terrainAt(state, x, y)
  if (region === 'void') return t === 'void'
  if (region === 'underground') return t === 'land'
  if (region === 'underwater') return t === 'water'
  return t !== 'void' // surface exists atop any site (land or water)
}

/**
 * Disabled = explicit disable, or [X]bound off its terrain.
 * A disabled minion loses all abilities, doesn't strike, can't cast or act.
 */
/** Cheap, NON-recursive "directly disabled": explicit disable flag/keyword, or
 *  disabled by a carrier / carried artifact. Does NOT scan area statics or parse
 *  keyword text — so it's safe to call in hot static loops (grantsPower/grantsKeywords
 *  run per unit per render; the full isDisabled there was O(U)×regex and hung dense
 *  boards). Use this to gate a static's SOURCE; use isDisabled for direct queries. */
export function directlyDisabled(state: GameState, unit: UnitState): boolean {
  if (getScript(unit.name)?.immuneToDisable && !unit.silenced) return false
  if (unit.modifiers.some((m) => m.kind === 'keyword' && m.keyword === 'undisableable')) return false
  // some carriers disable their cargo (Hyperparasite's grip, Brobdingnag's belly)
  if (unit.carriedBy) {
    const carrier = state.units[unit.carriedBy]
    if (carrier && getScript(carrier.name)?.carriedAreDisabled && !carrier.silenced) return true
  }
  if (unit.disabled) return true
  if (unit.modifiers.some((m) => m.kind === 'keyword' && m.keyword === 'disabled')) return !unit.isAvatar
  // shackled by a carried artifact (Iron Shackles)
  for (const artId of unit.carrying) {
    const art = state.artifacts[artId]
    if (art && artScript(state, art)?.bearerDisabled) return true // a silenced shackle doesn't disable
  }
  return false
}

/** External disable: direct (flag/keyword/carrier/bearer) PLUS the AREA statics —
 *  a Root Spider gaze, Stone-gaze Gorgon, Hillock Basilisk, Babbling Brook, a
 *  disabling aura, Cold Iron Rod. Only ever calls a disable hook on sources that
 *  actually have one (getScript lookups), and — unlike the full isDisabled — does
 *  NOT parse card keyword text. Cheap enough to gate a static's SOURCE inside the
 *  per-unit render loops (grantsPower/grantsKeywords/affinity…) while still catching
 *  the area cases directlyDisabled misses. NON-recursive: a disabler that is itself
 *  directly-disabled is skipped (the full isDisabled(o) here would be O(U!)). */
/** "Can't be modified" (Monks of Kobalsa, Bedrock, Druid's back face, Doom of Dilmun, or a unit
 *  carrying a bearerUnmodifiable artifact): the unit can't be disabled, silenced, immobilized, or
 *  transformed, and can't gain/lose abilities or have its characteristics changed. (Cost changes
 *  while still in hand DO apply — abilities only bite in the realm. Wards are the one allowed
 *  modification, permitted at grantKeyword.) */
export function isUnmodifiable(state: GameState, unit: UnitState): boolean {
  if (getScript(unit.name)?.unmodifiable) return true
  return unit.carrying.some((id) => {
    const a = state.artifacts[id]
    return !!a && !!artScript(state, a)?.bearerUnmodifiable // silenced → no longer makes bearer unmodifiable
  })
}

/** "Can't be immobilized." Sources: an unmodifiable unit (an immobilization IS a modification); a card
 *  whose text grants it (`immuneToImmobilize` — Gossamer Ghost); or an Onslaught-style `unimmobilizable`
 *  grant. effKeywords strips the Immobile keyword (printed OR granted) when this holds, so EVERY reader
 *  of kw.immobile honours the immunity. Kept SEPARATE from disable-immunity — a card grants whichever
 *  its own text names, never both by implication. */
export function immobilizeImmune(state: GameState, unit: UnitState): boolean {
  if (isUnmodifiable(state, unit)) return true
  if (getScript(unit.name)?.immuneToImmobilize && !unit.silenced) return true
  return unit.modifiers.some((m) => m.kind === 'keyword' && m.keyword === 'unimmobilizable')
}

/** "Can't be silenced." Sources: an unmodifiable unit (a silence IS a modification) or an
 *  Onslaught-style `unsilenceable` grant. Guards every spot that would set `unit.silenced`. */
export function silenceImmune(state: GameState, unit: UnitState): boolean {
  if (isUnmodifiable(state, unit)) return true
  return unit.modifiers.some((m) => m.kind === 'keyword' && m.keyword === 'unsilenceable')
}

export function disabledByEffect(state: GameState, unit: UnitState): boolean {
  if (isUnmodifiable(state, unit)) return false // can't be disabled
  if (getScript(unit.name)?.immuneToDisable && !unit.silenced) return false
  if (unit.modifiers.some((m) => m.kind === 'keyword' && m.keyword === 'undisableable')) return false
  if (directlyDisabled(state, unit)) return true
  if (unit.isAvatar) return false
  const brookHits = (): boolean => {
    for (const ad of (state.flow?.areaDisables ?? []) as { siteId: string }[]) {
      const src = state.sites[ad.siteId]
      if (!src || unit.region !== 'surface' || !siteAt(state, unit.x, unit.y)) continue
      if (nearbySquaresW(state, src.x, src.y).some((q) => q.x === unit.x && q.y === unit.y)) return true
    }
    return false
  }
  // an "at rest" disable (Basilisk / Gorgons) does NOT bite: the unit currently resolving its own
  // move/attack (`flow.actingUnitId`, until it comes to rest); a unit still ENTERING the realm
  // (`flow.entering`, until its Genesis + prompts resolve); OR any unit PARTAKING in a battle
  // (`flow.battleUnits` — attacker, defenders, targets — until the fight is over and damage allocated,
  // incl. a Basilisk that itself moved in to defend). None of these is "at rest" yet — and since it is
  // NOT disabled while fighting, it KEEPS its Ward/Stealth for that fight (the Basilisk either disables
  // or it doesn't; if it doesn't, no ability is lost).
  const acting = state.flow?.actingUnitId as string | undefined
  const entering = state.flow?.entering as string[] | undefined
  const battleUnits = state.flow?.battleUnits as string[] | undefined
  const notAtRest = unit.id === acting || !!entering?.includes(unit.id) || !!battleUnits?.includes(unit.id)
  const disablesNow = (name: string, srcId: string): boolean => {
    const sc = getScript(name)
    if (!sc?.disablesOther?.(state, srcId, unit)) return false
    if (sc.disablesOnlyAtRest && notAtRest) return false
    return true
  }
  // iterate ONLY the indexed disable-sources (checkStateBased maintains it) — O(1) on
  // a board with none. Trust the index only while its generation stamp matches the
  // current nextId (i.e. no new source entered since it was built); else full-scan.
  const ix = state.flow?.disablerIndex as { gen: number; u: string[]; a: string[]; r: string[]; area: boolean } | undefined
  if (ix && ix.gen === state.nextId) {
    for (const oid of ix.u) {
      const o = state.units[oid]
      if (!o || o.id === unit.id || o.silenced || directlyDisabled(state, o)) continue
      if (disablesNow(o.name, o.id)) return true
    }
    for (const aid of ix.a) {
      const art = state.artifacts[aid]
      if (!art || art.carriedBy) continue
      if (disablesNow(art.name, art.id)) return true
    }
    for (const rid of ix.r) {
      const aura = state.auras[rid]
      if (aura && getScript(aura.name)?.auraDisablesUnit?.(state, aura, unit)) return true
    }
    if (ix.area && brookHits()) return true
  } else {
    for (const o of Object.values(state.units)) {
      if (o.id === unit.id || o.silenced || directlyDisabled(state, o)) continue
      if (disablesNow(o.name, o.id)) return true
    }
    for (const a of Object.values(state.artifacts)) {
      if (!a.carriedBy && disablesNow(a.name, a.id)) return true
    }
    for (const r of Object.values(state.auras)) {
      if (getScript(r.name)?.auraDisablesUnit?.(state, r, unit)) return true
    }
    if (brookHits()) return true
  }
  const selfDisabled = getScript(unit.name)?.selfDisabled
  if (selfDisabled && !unit.silenced && selfDisabled(state, unit)) return true
  return false
}

// The "Court" minions. Overflowing Court's "Other Courts are disabled" shuts these off too — not just
// the four Court sites (which courtActive gates). Courtesan Thaïs is a Courtesan, not a Court, so she's out.
const COURT_MINIONS = new Set(['Seelie Court', 'Unseelie Court', 'Court Jester'])

export function isDisabled(state: GameState, unit: UnitState): boolean {
  if (isBlanked(unit)) return true // a blanked flip husk is no longer a minion — it can't act
  if (disabledByEffect(state, unit)) return true
  // an active Overflowing Court disables every OTHER Court, including Court minions (its source is a
  // site, so a Court minion is always "other"): they lose their abilities until the disabler's next turn
  if (COURT_MINIONS.has(unit.name) && ((state.flow?.courtDisables ?? []) as unknown[]).length > 0) return true
  if (unit.isAvatar) return false
  // [X]bound off its terrain — the ONLY disable needing the printed keyword; kept out
  // of disabledByEffect so per-unit render loops never pay parseKeywords. ([X]bound
  // aquatic/land minions don't grant statics, so gating sources on disabledByEffect
  // loses nothing.) Immune / undisableable already short-circuited to false above.
  if (getScript(unit.name)?.immuneToDisable && !unit.silenced) return false
  if (unit.modifiers.some((m) => m.kind === 'keyword' && m.keyword === 'undisableable')) return false
  const kw = getKeywords(unit.name)
  const terrain = terrainAt(state, unit.x, unit.y)
  if (kw.waterbound && terrain !== 'water') return true
  if (kw.landbound && terrain !== 'land') return true
  return false
}

/** can this unit currently exist in the given region at (x,y)? */
export function canExistIn(state: GameState, unit: UnitState, region: Region, x: number, y: number): boolean {
  if (unit.isAvatar) return region === 'surface'
  // A disabled minion loses Burrowing/Submerge/Voidwalk like every other ability, so it can no longer
  // exist underground/underwater/void — checkStateBased then drowns/suffocates/banishes it. (Intended.)
  const kw = effKeywords(state, unit)
  if (region === 'void') return !!kw.voidwalk
  if (region === 'underground') return !!kw.burrowing && terrainAt(state, x, y) === 'land'
  if (region === 'underwater') return !!kw.submerge && terrainAt(state, x, y) === 'water'
  return true
}

/** Is this unit carried INSIDE its carrier (a swallow/belly — Bullfrog, Bogeyman),
 *  rather than riding on top (Fine Courser, War Horse)? Only "inside" cargo is
 *  disabled and out of reach; on-top passengers act and are targeted normally
 *  (rulebook: "A unit being carried may still cast spells or activate abilities"). */
export function carriedInside(state: GameState, unit: { carriedBy?: string | null }): boolean {
  if (!unit.carriedBy) return false
  const carrier = state.units[unit.carriedBy]
  return !!(carrier && getScript(carrier.name)?.carriedAreDisabled && !carrier.silenced)
}

/** can a projectile hit this unit? (Stealth and projectile-transparent units are skipped) */
export function projectileCanHit(state: GameState, unit: UnitState): boolean {
  if (carriedInside(state, unit)) return false // swallowed cargo isn't on the board to be hit
  if (unit.stealth) return false
  const t = getScript(unit.name)?.projectileTransparent
  if (t === true) return false
  if (typeof t === 'function' && !unit.silenced && t(state, unit)) return false
  // Crawling Congregation also shields adjacent allies
  for (const other of Object.values(state.units)) {
    if (other.id === unit.id || other.silenced || disabledByEffect(state, other) || other.controller !== unit.controller) continue
    if (other.name === 'Crawling Congregation') {
      // adjacent (or co-located), Magellan-aware
      const adj = adjacentSquaresW(state, other.x, other.y).some((s) => s.x === unit.x && s.y === unit.y)
      if (adj) return false
    }
  }
  return true
}

/** attacks against the site at (x,y) and surface units atop it are blocked
 *  (Dome of Osiros, Blizzard, White Hart) */
export function attackBlockedAt(state: GameState, x: number, y: number, target?: UnitState): boolean {
  for (const site of Object.values(state.sites)) {
    if (site.x === x && site.y === y && getScript(site.name)?.siteBlocksAttacks) return true
  }
  for (const aura of Object.values(state.auras)) {
    if (getScript(aura.name)?.auraBlocksAttacks && aura.squares.some((s) => s.x === x && s.y === y)) return true
  }
  for (const u of Object.values(state.units)) {
    if (u.silenced || u.id === target?.id) continue
    const f = getScript(u.name)?.unitBlocksAttacksAt
    if (f && f(state, u.id, x, y)) return true
  }
  return false
}

/** surface units at (x,y) can't be intercepted (Blizzard) */
export function interceptBlockedAt(state: GameState, x: number, y: number): boolean {
  for (const aura of Object.values(state.auras)) {
    if (getScript(aura.name)?.auraBlocksIntercepts && aura.squares.some((s) => s.x === x && s.y === y)) return true
  }
  return false
}

/** effective subtypes: printed subtypes as modified by cards in play
 *  (Corruptor, Bower of Bliss, Azuridge Caravan) */
/** Effective subtypes of a card that is NOT in the realm (a hand/collection card),
 *  for `player`, honoring controller-based identity overrides (Corruptor: "your
 *  Beasts are Monsters"). Positional/per-unit overrides don't match the off-board
 *  probe, so only whole-side rewrites apply — exactly what "a Monster from your
 *  hand" needs when a Corruptor turns your Beasts into Monsters. */
export function cardSubtypesFor(state: GameState, player: PlayerId, cardName: string): string[] {
  const probe: UnitState = {
    id: '', cardId: '', name: cardName, owner: player, controller: player, isAvatar: false,
    x: -1, y: -1, region: 'surface', tapped: false, damage: 0, enteredTurn: state.turn,
    modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
  }
  return effSubtypes(state, probe)
}

export function effSubtypes(state: GameState, unit: UnitState): string[] {
  // An Avatar DOES keep its printed subtypes: Mephistopheles replaces the avatar but stays a Demon
  // (Air) Avatar (FAQ 1953), so subtype-gated effects still see it as a Demon. Most avatars simply
  // have no printed subtypes, so this returns [] for them anyway.
  let st = [...getCard(unit.name).subtypes]
  const own = getScript(unit.name)?.selfSubtypes
  if (own && !unit.silenced) st = own(state, unit, st)
  for (const u of Object.values(state.units)) {
    const o = getScript(u.name)?.subtypeOverride
    if (o && !u.silenced) st = o(state, u.id, unit, st)
  }
  for (const s of Object.values(state.sites)) {
    const o = getScript(s.name)?.subtypeOverride
    if (o && s.controller !== null && !siteSilenced(state, s)) st = o(state, s.id, unit, st)
  }
  for (const a of Object.values(state.artifacts)) {
    const o = getScript(a.name)?.subtypeOverride
    if (o && !artifactSilenced(state, a)) st = o(state, a.id, unit, st)
  }
  return st
}

/** codex: automatons are minions AND artifacts — effects that target, destroy
 *  or silence artifacts also reach these units (includes animated artifacts) */
export function isArtifactUnit(state: GameState, u: UnitState): boolean {
  if (u.isAvatar) return false
  if (getCard(u.name).subtypes.includes('Automaton')) return true
  if (effSubtypes(state, u).includes('Automaton')) return true
  return false
}

/** Saint of Redemption: while she stands, NO minion anywhere is Evil */
export function saintWatches(state: GameState): boolean {
  return Object.values(state.units).some((x) => x.name === 'Saint of Redemption' && !x.silenced)
}

/** is this unit Evil? Demon/Undead/Monster (honoring subtype overrides and
 *  Persecutor's brand), all overridden by Saint of Redemption */
export function isEvilUnit(state: GameState, u: UnitState): boolean {
  if (saintWatches(state)) return false
  // A Demon/Undead/Monster Avatar IS Evil (Mephistopheles stays an Evil Demon Avatar, FAQ 1953). The
  // "Evil minions can't be warded" clause is enforced separately in wardUnit (gated on !isAvatar), so an
  // Evil Avatar can still be warded even though it reads Evil here.
  // Evil Twin: "Enters the realm as an EVIL copy" — Evil regardless of the copied
  // shape. The name swap makes its own script unreachable, so the counter carries it.
  if (u.counters?.evilTwin) return true
  const st = effSubtypes(state, u)
  return st.includes('Demon') || st.includes('Undead') || st.includes('Monster')
}

/** is this card name printed-Evil? (for hand/spellbook checks — the Saint
 *  redeems minions in every zone) */
export function isEvilCardName(state: GameState, name: string): boolean {
  if (saintWatches(state)) return false
  const st = getCard(name).subtypes
  return st.includes('Demon') || st.includes('Undead') || st.includes('Monster')
}

/** as isEvilCardName, but honoring the caster's controller-based subtype rewrites (a Corruptor makes
 *  their Beasts Monsters, Mortals Undead, Angels Demons) — so "the next Evil cast" effects (Den of Evil)
 *  recognise a card that is Evil only because of a Corruptor. */
export function isEvilCardNameFor(state: GameState, player: PlayerId, name: string): boolean {
  if (saintWatches(state)) return false
  const st = cardSubtypesFor(state, player, name)
  return st.includes('Demon') || st.includes('Undead') || st.includes('Monster')
}

export function hasSubtype(state: GameState, unit: UnitState, subtype: string): boolean {
  return effSubtypes(state, unit).includes(subtype)
}

/** effective elements (Azuridge Caravan has all of them) */
export function effElements(state: GameState, unit: UnitState): string[] {
  let els = [...getCard(unit.name).elements]
  const own = getScript(unit.name)?.selfElements
  if (own && !unit.silenced) els = own(state, unit, els)
  return els
}

/** The from-cemetery activatable abilities a specific card in a cemetery offers `player`: its own
 *  `cemeteryAbilities` (Grigori Rasputin). For a card that copies abilities "wherever it is" (Vivien),
 *  its cemeteryAbilities hook itself folds in the realm sources' `usableFromCemetery` activated
 *  abilities — so an ORDINARY dead minion never offers a from-realm ability, only Vivien does. Used
 *  by the GUI cemetery list/glow and by grantedAbilities below, so the same keys drive both. */
export function cardCemeteryAbilities(state: GameState, cardId: string, player: PlayerId): AbilityDef[] {
  const sc = getScript(state.cards[cardId]?.name ?? '')
  return sc?.cemeteryAbilities ? sc.cemeteryAbilities(state, cardId, player) : []
}

/** Grouped by card: every cemetery card of `player` that offers a from-cemetery ability (for the
 *  cemetery viewer's activation list, the widget tooltip, and the slimy-green glow). */
export function cemeteryActivations(state: GameState, player: PlayerId): { cardId: string; name: string; abilities: AbilityDef[] }[] {
  const out: { cardId: string; name: string; abilities: AbilityDef[] }[] = []
  for (const cardId of state.players[player]?.cemetery ?? []) {
    const ab = cardCemeteryAbilities(state, cardId, player)
    if (ab.length) out.push({ cardId, name: state.cards[cardId]?.name ?? '?', abilities: ab })
  }
  return out
}

/** The shared "release this disabled minion" effect for Bind Evil (`bound`) / Gargantula (`cocooned`),
 *  surfaced by the engine so the release stays available after the binding source has left play. */
function freeBoundMinion(unitId: string, counter: 'bound' | 'cocooned', how: string): AbilityDef['effect'] {
  return (ctx) => {
    const b = ctx.state.units[unitId]
    if (!b) return
    b.disabled = undefined
    if (b.counters) delete b.counters[counter]
    ctx.log(`${b.name} ${how}`)
  }
}

/** activated abilities granted to a unit by artifacts, auras, and sites (Battering Ram, Homecoming) */
export function grantedAbilities(state: GameState, unit: UnitState): AbilityDef[] {
  const out: AbilityDef[] = []
  // asks made by cross-granted abilities must resolve on the GRANTING script's
  // conts, so every grant is tagged with its origin (see AbilityDef.contOwner)
  const tag = (abilities: AbilityDef[], origin: string) =>
    abilities.map((a) => (a.contOwner ? a : { ...a, contOwner: origin }))
  for (const u of Object.values(state.units)) {
    const g = getScript(u.name)?.grantsAbilities
    if (g && !u.silenced && !isBlanked(u)) out.push(...tag(g(state, u.id, unit), u.name))
  }
  for (const art of Object.values(state.artifacts)) {
    const g = artScript(state, art)?.artifactGrantsAbilities // silenced → grants no abilities
    if (g) out.push(...tag(g(state, art.id, unit), art.name))
  }
  for (const aura of Object.values(state.auras)) {
    const g = getScript(aura.name)?.auraGrantsAbilities
    if (g) out.push(...tag(g(state, aura, unit), aura.name))
  }
  for (const site of Object.values(state.sites)) {
    const g = getScript(site.name)?.siteGrantsAbilities
    if (g && !siteSilenced(state, site)) out.push(...tag(g(state, site, unit), site.name))
  }
  // Persistent bindings stay releasable even after the SOURCE that made them has left play — Bind Evil
  // is a spell already in the cemetery, and a Gargantula may since have died. So the release ability is
  // surfaced from the DISABLED minion's own counter (not the vanished source), keyed uniquely per minion:
  //   • Bind Evil (`bound`)    — any ADJACENT Spellcaster or Avatar may Tap → release it.
  //   • Gargantula (`cocooned`) — any unit sharing its location may Tap → cut it free.
  for (const b of Object.values(state.units)) {
    if (!b.disabled || b.id === unit.id) continue
    const sameLoc = unit.x === b.x && unit.y === b.y && unit.region === b.region
    const adjacent = unit.region === b.region && orthAdjacentWrapped(state, b.x, b.y).some((s) => s.x === unit.x && s.y === unit.y)
    if (b.counters?.bound && adjacent && (unit.isAvatar || effKeywords(state, unit).spellcaster)) {
      out.push({ key: `bind:release:${b.id}`, label: `Tap → Release ${b.name}`, cost: { tap: true }, effect: freeBoundMinion(b.id, 'bound', 'is released from its bindings') })
    }
    if (b.counters?.cocooned && sameLoc) {
      out.push({ key: `cocoon:free:${b.id}`, label: `Tap → Cut ${b.name} free`, cost: { tap: true }, effect: freeBoundMinion(b.id, 'cocooned', 'is cut free of the cocoon') })
    }
  }
  // hand-activated cards surface their abilities on their owner's Avatar.
  // NB: client VIEWS omit the private zone arrays (spellbook/atlas absent, hand may be
  // a 'hidden'-filled projection) — see engine/view.ts. Guard each iteration with
  // `?? []` so this helper is view-safe; without it a `for…of undefined` throws and the
  // caller (Game.tsx unitActions) silently swallows it, hiding ALL granted abilities
  // (Dragonlord's invoked aspect, hand/cemetery-activated cards) from the UI.
  if (unit.isAvatar) {
    const owner = state.players[unit.controller]
    for (const cardId of owner.hand ?? []) {
      const name = state.cards[cardId]?.name ?? ''
      const g = getScript(name)?.handAbilities
      if (g) out.push(...tag(g(state, cardId, unit.controller), name))
    }
    // ... and so do cemetery-activated cards (Grigori Rasputin) — the Bureau
    // of Occult Control tolls that access
    const toll = zoneAccessToll(state)
    for (const cardId of owner.cemetery ?? []) {
      const name = state.cards[cardId]?.name ?? ''
      // cemeteryAbilities + usableFromCemetery activated abilities (Savior via a cemetery Vivien)
      const ab = cardCemeteryAbilities(state, cardId, unit.controller)
      if (ab.length) out.push(...tag(ab, name).map((a) => (toll ? { ...a, cost: { ...a.cost, mana: (a.cost.mana ?? 0) + toll } } : a)))
    }
    // ... and spellbook cards seen by the enemy (The Inquisition)
    for (const cardId of owner.spellbook ?? []) {
      const name = state.cards[cardId]?.name ?? ''
      const g = getScript(name)?.spellbookAbilities
      if (g) out.push(...tag(g(state, cardId, unit.controller), name))
    }
  }
  return out
}

/** the distinct card names still available in a player's collection (count > 0) */
export function collectionNames(state: GameState, player: PlayerId): string[] {
  const col = state.players[player]?.collection ?? {}
  // a card the Legion of Gall banished from this collection is GONE — it drops out of every fetch pool
  // (Silver Bullet, Toolbox, Malleus, Imposter, Erik's Curiosa…), not just the cast-time reject.
  return Object.keys(col).filter((n) => col[n] > 0 && !collectionBanned(state, player, n))
}

/** consume one copy of a card from a player's collection (fetched into play) */
export function takeFromCollection(state: GameState, player: PlayerId, name: string): void {
  const col = state.players[player]?.collection
  if (col && col[name] > 0) col[name] -= 1
}

/** summoning sickness: minions can't tap / be tapped the turn they entered (Charge exempts) */
/** A minion has summoning sickness the turn it enters, unless it has (effective)
 *  Charge. Avatars never do. This is the sole arbiter — the UI spiral marker and
 *  canTap both read it. */
export function isSummoningSick(state: GameState, unit: UnitState): boolean {
  if (unit.isAvatar) return false
  if (unit.enteredTurn !== state.turn) return false
  let charge = !!effKeywords(state, unit).charge
  // sites can deny Charge nearby (Pebbled Paths: "Minions atop nearby sites lose Charge"). "Nearby" is
  // the site's OWN square PLUS the surrounding ones (rulebook), and Magellan-aware — so a minion summoned
  // directly ATOP the Pebbled Paths is affected too, not just its neighbours.
  if (charge && unit.region === 'surface') {
    for (const site of Object.values(state.sites)) {
      if (site.isRubble || siteSilenced(state, site) || !getScript(site.name)?.denyChargeNearby) continue
      if (nearbySquaresW(state, site.x, site.y).some((s) => s.x === unit.x && s.y === unit.y)) {
        charge = false
        break
      }
    }
  }
  return !charge
}

export function canTap(state: GameState, unit: UnitState): boolean {
  if (unit.tapped) return false
  return !isSummoningSick(state, unit)
}
