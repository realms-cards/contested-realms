import { getCard, cardSupport, getKeywords } from '../cards/db'
import { getScript, type CardScript, type TargetRef, type TargetSpec } from '../cards/scripts/registry'
import type { GameState, PlayerId, Region, Thresholds, UnitState } from './types'
import { adjacentSquares, adjacentSquaresW, avatarOf, chebyshev, chebyshevW, orthAdjacentWrapped, nearbySquares, nearbySquaresW, siteAt, sitesOf, inBounds, unitsAt, occupies, occupiedSquares, GRID_W, GRID_H, edgesConnected, aura2x2Squares } from './grid'
import { newId, pushLog, makeCtx, checkStateBased, opponent, emitUnitEnters, emitEvent, isMagicProtected, loseLife, checkWard, pushPrompt, registerCont, runCont, toCemetery, bumpManaSpent, beginAreaReveal, recordAffectedSites, snapshotRealm, recordTouchedSites, sealSpellReveal, setActionCredit, restoreActionCredit, firesGenesisOnEntry, recordManaGain, deferTurnStep, settleEntering, runDamageEvent } from './effects'
import { affinity, effKeywords, isDisabled, disabledByEffect, canExistIn, siteSilenced, siteDisabledByArtifact, artifactSilenced, artScript, zoneAccessToll, applyKeywordString, isArtifactUnit, isEvilUnit, isEvilCardName, isEvilCardNameFor, cardSubtypesFor, collectionBanned, payZoneToll, takeFromCollection, carriedInside, isBlanked, isCarriableArtifact, terrainAt } from './statics'
import { siteEntryAllowed } from './movement'
import { TRAP_DISGUISE, trapElementOf } from './traps'

// ---- affinity ----
// `affinity` now lives in statics.ts so static/replacement gates in effects.ts and statics.ts itself
// (Kor Crematory, Wormelow Tump) can read it without an import cycle. Re-exported here because many
// modules import it from './casting'.
export { affinity }

export function meetsThreshold(have: Thresholds, need: Thresholds): boolean {
  return have.air >= need.air && have.earth >= need.earth && have.fire >= need.fire && have.water >= need.water
}

// ---- playing sites (avatar tap ability) ----

/** The STANDARD site-play squares for `player`: empty squares bordering a site they control (or,
 *  with no sites yet, the squares closest to their avatar). `ignoreSiteId` treats that site's square
 *  as empty and drops it from the adjacency set — used when asking "where could a site go?" from the
 *  vantage of a site already on the board (Mirror Realm testing what it could have become). */
export function baseSiteSquares(state: GameState, player: PlayerId, ignoreSiteId?: string): { x: number; y: number }[] {
  const candidates: { x: number; y: number }[] = []
  for (let x = 0; x < GRID_W; x++) {
    for (let y = 0; y < GRID_H; y++) {
      const existing = siteAt(state, x, y)
      if (existing && !existing.isRubble && existing.id !== ignoreSiteId) continue // one site per square (rubble is replaced)
      candidates.push({ x, y })
    }
  }
  const mySites = sitesOf(state, player).filter((s) => !s.isRubble && s.id !== ignoreSiteId)
  if (mySites.length > 0) {
    // must border a site you control (own square excluded — it's occupied); Magellan-aware, so a site
    // across the joined edge counts as bordering
    return candidates.filter((c) => orthAdjacentWrapped(state, c.x, c.y).some((n) => mySites.some((s) => s.x === n.x && s.y === n.y)))
  }
  // no sites: as close as possible to your avatar (wrapped distance under a Magellan Globe)
  const avatar = avatarOf(state, player)
  let best = Infinity
  for (const c of candidates) best = Math.min(best, chebyshevW(state, c, avatar))
  return candidates.filter((c) => chebyshevW(state, c, avatar) === best)
}

/** Would a site named `name` be a legal placement for `player` at square `S`, treating `S` as empty
 *  (ignoring the site `ignoreSiteId` currently sitting there)? Honors the card's own placement rule
 *  (Cornerstone: any corner → 'allow'; Edge of the World: must be void-adjacent → 'deny' otherwise),
 *  its extra script-supplied squares (Rift Valley's pull-apart seams), and standard adjacency. Does
 *  NOT re-check occupancy by OTHER sites — callers pass empty (or self-occupied) squares. */
export function siteLegalAt(state: GameState, player: PlayerId, name: string, S: { x: number; y: number }, ignoreSiteId?: string): boolean {
  const verdict = getScript(name)?.sitePlacement?.(state, player, S)
  if (verdict === 'deny') return false
  if (verdict === 'allow') return true
  const extra = getScript(name)?.extraSiteSquares?.(state, player)
  if (extra?.some((e) => e.x === S.x && e.y === S.y)) return true
  return baseSiteSquares(state, player, ignoreSiteId).some((b) => b.x === S.x && b.y === S.y)
}

export function legalSiteSquares(state: GameState, player: PlayerId, cardName?: string): { x: number; y: number }[] {
  const candidates: { x: number; y: number }[] = []
  for (let x = 0; x < GRID_W; x++) {
    for (let y = 0; y < GRID_H; y++) {
      const existing = siteAt(state, x, y)
      if (existing && !existing.isRubble) continue // one site per square (rubble is replaced)
      candidates.push({ x, y })
    }
  }
  // per-card placement rules (Cornerstone: any corner; Edge of the World: void-adjacent;
  // Mirror Realm: any square a copyable nearby site could itself be played to)
  const placement = cardName ? getScript(cardName)?.sitePlacement : undefined
  const base = baseSiteSquares(state, player)
  let result = base
  if (placement) {
    const out: { x: number; y: number }[] = []
    for (const c of candidates) {
      const verdict = placement(state, player, c)
      if (verdict === 'deny') continue
      if (verdict === 'allow' || base.some((b) => b.x === c.x && b.y === c.y)) out.push(c)
    }
    result = out
  }
  // Mirage: may be played atop a site you own, returning it to your hand
  if (cardName && getScript(cardName)?.mayReplaceOwnSite) {
    for (const s of Object.values(state.sites)) {
      if (!s.isRubble && s.owner === player && !result.some((r) => r.x === s.x && r.y === s.y)) result.push({ x: s.x, y: s.y })
    }
  }
  // Heirloom Lost: may replace matching sites of ANY player
  const replaceAny = cardName ? getScript(cardName)?.mayReplaceSite : undefined
  if (replaceAny) {
    for (const s of Object.values(state.sites)) {
      if (!s.isRubble && replaceAny(state, player, s) && !result.some((r) => r.x === s.x && r.y === s.y)) result.push({ x: s.x, y: s.y })
    }
  }
  // Rift Valley: extra script-supplied squares (pull-apart seams)
  const extra = cardName ? getScript(cardName)?.extraSiteSquares?.(state, player) : undefined
  if (extra) {
    for (const s of extra) if (!result.some((r) => r.x === s.x && r.y === s.y)) result.push(s)
  }
  // walls of salt: some auras forbid playing sites on their squares
  return result.filter(
    (r) => !Object.values(state.auras).some((a) => getScript(a.name)?.auraBlocksSitePlay && a.squares.some((q) => q.x === r.x && q.y === r.y)),
  )
}

export function playSite(state: GameState, player: PlayerId, cardId: string, x: number, y: number, opts?: { force?: boolean }): string | null {
  const p = state.players[player]
  const card = state.cards[cardId]
  if (!card || !p.hand.includes(cardId)) return 'That site is not in your hand.'
  const def = getCard(card.name)
  if (def.type !== 'Site') return `${card.name} is not a site.`
  // `force` = a card dictates WHERE (Imperial Road makes an opponent play a site beside the
  // road, not beside their own sites), so the normal placement-adjacency rule doesn't apply.
  // The caller is responsible for validating the square; only occupancy is still checked here.
  if (opts?.force) {
    const here = siteAt(state, x, y)
    if (here && !here.isRubble) return 'A site already occupies that square.'
  } else if (!legalSiteSquares(state, player, card.name).some((s) => s.x === x && s.y === y)) {
    return 'You cannot play a site there.'
  }

  // Rift Valley: the whole play is scripted (pull apart a row/column first)
  const custom = getScript(card.name)?.customSitePlay
  if (custom && getScript(card.name)?.extraSiteSquares?.(state, player)?.some((s) => s.x === x && s.y === y)) {
    return custom(state, player, cardId, x, y)
  }

  const existing = siteAt(state, x, y)
  let inheritController: PlayerId | null = null
  if (existing?.isRubble) delete state.sites[existing.id]
  else if (existing && getScript(card.name)?.mayReplaceOwnSite && existing.owner === player) {
    // Mirage: the replaced site returns to its owner's hand
    p.hand.push(existing.cardId)
    delete state.sites[existing.id]
    pushLog(state, player, `${existing.name} returns to ${p.name}'s hand.`)
  } else if (existing && getScript(card.name)?.mayReplaceSite?.(state, player, existing)) {
    // Heirloom Lost: the replaced site's controller keeps the new one; the
    // replaced site is BANISHED (FAQ) unless the replacer says otherwise
    inheritController = existing.controller
    if (getScript(card.name)?.replacedSiteIsBanished) state.players[existing.owner].banished.push(existing.cardId)
    else state.players[existing.owner].cemetery.push(existing.cardId)
    delete state.sites[existing.id]
    // let the incoming site's genesis know what it supplanted (Apex of Babel)
    state.flow = state.flow ?? {}
    state.flow.lastReplacedSite = { name: existing.name, by: cardId }
    pushLog(state, player, `${existing.name} is supplanted.`)
  }

  p.hand.splice(p.hand.indexOf(cardId), 1)
  enterSite(state, player, cardId, x, y, inheritController)
  return null
}

/** Put a site into the realm at (x,y) and run every entry consequence: printed Ward, the
 *  mana it provides (respecting noMana / siteExtraMana / aura boosts), lifting any void units
 *  atop it, its GENESIS (unless it enters silenced), the onSitePlayed event, and a state-based
 *  check. Callers first remove the card from wherever it came (hand for a normal play, the
 *  atlas for Pathfinder) and resolve any replacement. Returns the new site's id. */
export function enterSite(
  state: GameState,
  player: PlayerId,
  cardId: string,
  x: number,
  y: number,
  inheritController: PlayerId | null = null,
): string {
  const p = state.players[player]
  const card = state.cards[cardId]
  const def = getCard(card.name)
  const script = getScript(card.name)
  // SITE TRAP: played FACE-DOWN, stored AS the basic site of its single element (Spire/Valley/…). The
  // real identity lives in `trap` (revealed to the owner only), and because everything keys off
  // `site.name` the trap masquerades as that basic site until it is sprung — no per-hook gating.
  const trapElement = script?.siteTrap ? trapElementOf(def.thresholds) : undefined
  const displayName = trapElement ? TRAP_DISGUISE[trapElement] : card.name
  const siteId = newId(state, 's')
  state.sites[siteId] = {
    id: siteId,
    cardId,
    name: displayName,
    owner: player,
    controller: inheritController ?? player,
    x,
    y,
    tapped: false,
    isRubble: false,
    // printed Ward enters with the site (Blessed Well, Pilgrim's Shrine...); a face-down trap shows
    // the basic site's face, which is an Ordinary site with no Ward
    ward: trapElement ? undefined : (getKeywords(def.name).ward || undefined),
    ...(trapElement ? { trap: { element: trapElement, realName: card.name, realCardId: cardId } } : {}),
  }
  // a site provides one mana the moment it enters the realm (aura boosts like Abundance apply
  // immediately per the FAQ). A face-down trap gives the basic site's 1 (its real mana mods stay hidden).
  if (trapElement || !script?.noMana) {
    let gain = 1 + (trapElement ? 0 : (script?.siteExtraMana ?? 0))
    for (const r of Object.values(state.auras)) {
      const extra = getScript(r.name)?.auraSiteExtraMana
      if (extra && r.squares.some((q) => q.x === x && q.y === y)) gain += extra
    }
    p.mana += gain
    recordManaGain(state, x, y, 'surface', gain) // float "+n 🔮" over the freshly-played site
  }
  // log/lastPlay carry the DISGUISE name — the shared log must never leak a face-down trap's real card
  pushLog(state, player, `${p.name} plays ${displayName} at (${x + 1},${y + 1}).`)
  state.lastPlay = { name: displayName, player, n: (state.lastPlay?.n ?? 0) + 1 }

  // a square with a site has no void: any units that were in the void here are placed
  // atop the new site (rulebook: "Any cards in that void are now placed atop the site").
  // Without this their region stays 'void', so effects reading it (e.g. summoning a Frog
  // to them) put things into a void they can't survive.
  for (const u of Object.values(state.units)) {
    if (u.x === x && u.y === y && u.region === 'void') {
      u.region = 'surface'
      for (const artId of u.carrying) {
        const art = state.artifacts[artId]
        if (art) art.region = 'surface'
      }
    }
  }

  // a site that enters already silenced (e.g. played directly in front of Fields of Phyxis) has no
  // abilities — its Genesis does not fire. Nor does a face-down TRAP fire its real Genesis: it is
  // masquerading as a basic site, so its own effects wait until it is sprung.
  if (!trapElement && script?.genesis && !siteSilenced(state, { x, y })) script.genesis(makeCtx(state, siteId, player, []))
  const placed = state.sites[siteId]
  if (placed) emitEvent(state, 'onSitePlayed', player, { id: placed.id, x: placed.x, y: placed.y, name: placed.name })
  checkStateBased(state)
  return siteId
}

// ---- casting spells ----

export interface CastCheck {
  ok: boolean
  reason?: string
}

/** effective mana cost of casting `cardName`, after every in-play cost modifier */
export function effectiveCost(
  state: GameState,
  player: PlayerId,
  cardName: string,
  caster: UnitState,
  at?: { x: number; y: number },
  cardId?: string,
): number {
  // free-cast credits (Archimago echoes etc.)
  if (cardId && state.flow?.freeCast?.includes(cardId)) return 0
  const def = getCard(cardName)
  let cost = def.cost ?? 0
  const self = getScript(cardName)?.selfCostModifier
  if (self) cost += self(state, player, at)
  const applyFrom = (name: string, id: string) => {
    const mod = getScript(name)?.costModifier
    if (mod) cost += mod(state, id, caster, cardName, at)
  }
  // Witch's curse: spells cost ① more on the victim's next turn
  for (const c of (state.flow?.witchCurse ?? []) as { player: PlayerId; turn: number }[]) {
    if (c.player === player && state.activePlayer === player && state.turn > c.turn) cost += 1
  }
  // one-shot spell discounts (Four Waters of Paradise, Mix Aer, Pond, Merlin's Tower)
  for (const d of state.flow?.spellDiscounts ?? []) {
    if (spellDiscountMatches(state, d, player, cardName, at, false, caster?.id)) cost -= d.amount
  }
  for (const u of Object.values(state.units)) if (!u.silenced) applyFrom(u.name, u.id)
  for (const s of Object.values(state.sites)) if (s.controller !== null && !siteSilenced(state, s)) applyFrom(s.name, s.id)
  for (const a of Object.values(state.artifacts)) applyFrom(a.name, a.id)
  for (const r of Object.values(state.auras)) applyFrom(r.name, r.id)
  return Math.max(0, cost)
}

/** cards in hand cast as a DIFFERENT spell (Avatar of Fire: fire sites are also Fireballs) */
export function spellMorphName(state: GameState, player: PlayerId, cardName: string): string | null {
  const av = avatarOf(state, player)
  const morph = getScript(av.name)?.handSpellMorph
  if (!morph || av.silenced) return null
  return morph(state, player, cardName)
}

/** The NORMAL Spellcaster legality path: is this unit an avatar or Spellcaster, and
 *  do its element locks (spellcasterElement / spellcasterExclude) permit this spell?
 *  Returns an error string to reject, or null to accept. This is one of two arms in
 *  canCast — the other being a spell's casterFilter EXPANSION ("May be cast by…"). */
function normalCasterCheck(caster: UnitState, kw: ReturnType<typeof effKeywords>, def: ReturnType<typeof getCard>): string | null {
  if (!kw.spellcaster && !caster.isAvatar) return `${caster.name} is not a Spellcaster.`
  if (kw.spellcasterElements?.length) {
    // a multi-element spellcaster (Omphaloi) may cast a spell requiring ANY of its elements
    if (!kw.spellcasterElements.some((e) => (def.thresholds[e as keyof Thresholds] ?? 0) > 0))
      return `${caster.name} can only cast ${kw.spellcasterElements.join(' or ')} spells.`
  } else if (kw.spellcasterElement) {
    const el = kw.spellcasterElement as keyof Thresholds
    if ((def.thresholds[el] ?? 0) <= 0) return `${caster.name} can only cast ${kw.spellcasterElement} spells.`
  }
  if (kw.spellcasterExclude) {
    const el = kw.spellcasterExclude as keyof Thresholds
    if ((def.thresholds[el] ?? 0) > 0) return `${caster.name} cannot cast ${kw.spellcasterExclude} spells.`
  }
  return null
}

/** Resolve a caster id to a UnitState — a real unit, OR a spellcaster ARTIFACT (the Omphaloi)
 *  as a throwaway pseudo-caster carrying the artifact's NAME (so effKeywords/getKeywords resolve
 *  its "Air and Fire Spellcaster" identity) and its board position (targeting geometry, "summon
 *  here"). Returns null for a non-caster / silenced artifact / unknown id. Never added to state. */
export function resolveCaster(state: GameState, casterId: string, player: PlayerId): UnitState | null {
  const u = state.units[casterId]
  if (u) return u
  const art = state.artifacts[casterId]
  if (art && !artifactSilenced(state, art) && getKeywords(art.name).spellcaster) {
    const controller = art.carriedBy ? state.units[art.carriedBy]?.controller : art.conjuredBy
    return {
      id: art.id, cardId: art.cardId, name: art.name,
      owner: state.cards[art.cardId]?.owner ?? player, controller: controller ?? player,
      isAvatar: false, x: art.x, y: art.y, region: art.region ?? 'surface',
      tapped: false, damage: 0, enteredTurn: -1, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
    }
  }
  // A SITE can be a Spellcaster — printed ("River of Flame": "Fire Spellcaster") or granted this turn
  // (Merlin's Tower). It casts as a pseudo-unit AT the site's surface, so a projectile magic (Magic
  // Missiles, Ball Lightning…) fires FROM the site, not the avatar. A printed "X Spellcaster" already
  // yields spellcaster + the element lock via getKeywords(name); a granted PLAIN Spellcaster needs the
  // keyword injected (the Genesis text isn't a parseable keyword line).
  const site = state.sites[casterId]
  if (site && !site.isRubble && site.controller !== null && !siteSilenced(state, site)) {
    const printed = getKeywords(site.name).spellcaster
    const granted = (state.flow?.spellcasterSites ?? []).some((s: { siteId: string; turn: number }) => s.siteId === casterId && s.turn === state.turn)
    if (printed || granted) {
      return {
        id: site.id, cardId: site.cardId, name: site.name,
        owner: state.cards[site.cardId]?.owner ?? player, controller: site.controller,
        isAvatar: false, x: site.x, y: site.y, region: 'surface',
        tapped: false, damage: 0, enteredTurn: -1,
        modifiers: printed ? [] : [{ kind: 'keyword', keyword: 'spellcaster' } as any],
        carrying: [], carryingUnits: [], usedThisTurn: {},
      }
    }
  }
  return null
}

export function canCast(state: GameState, player: PlayerId, cardId: string, casterId: string): CastCheck {
  const p = state.players[player]
  const card = state.cards[cardId]
  const inHand = !!card && p.hand.includes(cardId)
  const inCemetery = !!card && p.cemetery.includes(cardId) && !!getScript(card.name)?.castFromCemetery
  if (!inHand && !inCemetery) return { ok: false, reason: 'Card is not in your hand.' }
  const morphed = inHand ? spellMorphName(state, player, card.name) : null
  const def = getCard(morphed ?? card.name)
  if (def.type === 'Site' || def.type === 'Avatar') return { ok: false, reason: 'That card cannot be cast.' }
  if (cardSupport(def) === 'unsupported') return { ok: false, reason: `${card.name} is not implemented by the engine yet.` }
  // named spells sealed away (Hyter Sprites)
  if ((state.flow?.castBans ?? []).some((b: { name: string }) => b.name === (morphed ?? card.name)))
    return { ok: false, reason: `${card.name} can't be cast right now.` }
  // cards stolen by a living thief (Pith Imp) are sealed while it remains
  if ((state.flow?.stolen ?? []).some((s: { cardId: string; unitId: string }) => s.cardId === cardId && state.units[s.unitId]))
    return { ok: false, reason: `${card.name} is in the Pith Imp's clutches.` }

  // caster-locked cards: only their designated caster may cast them. A grant-style
  // lock (Archangel Gabriel, "this unit may cast…") confers the Spellcaster ability
  // for that spell, so the usual Spellcaster check is skipped. An innate lock
  // (Morgana, the Omphalos artifacts) relies on the caster's OWN Spellcaster ability
  // — so if Morgana is transformed into a non-spellcaster (a Frog!), she can't cast,
  // though her hand persists (FAQ). Being designated is still the targeting permission.
  const lock = (state.flow?.lockedCards ?? []).find((e: any) => e.cardId === cardId)
  if (lock) {
    const lockedUnit = state.units[lock.casterId]
    const lockedArt = state.artifacts[lock.casterId]
    if (!lockedUnit && !lockedArt) return { ok: false, reason: 'Only its bonded caster may cast that — and they are gone.' }
    if (lockedUnit) {
      // "only SHE can cast it" — the bonded unit is the ONLY legal caster (Morgana le Fay,
      // Gabriel's chosen minion). Reject any other casterId so the client offers no caster
      // picker (legalCasters returns just her) and no other unit — caster or not — can cast.
      if (casterId !== lock.casterId)
        return { ok: false, reason: `Only ${lockedUnit.name} may cast that.` }
      if (lockedUnit.controller !== player || isDisabled(state, lockedUnit))
        return { ok: false, reason: `Only ${lockedUnit.name} may cast that.` }
      if (!lock.grantsCasting && !lockedUnit.isAvatar && !effKeywords(state, lockedUnit).spellcaster)
        return { ok: false, reason: `${lockedUnit.name} has no way to cast that right now.` }
    }
    if (lockedArt) {
      // "which only IT can cast" — the Omphalos (a spellcaster artifact) casts its OWN drawn
      // spells itself; no other caster is legal, so the client offers no picker.
      if (casterId !== lock.casterId) return { ok: false, reason: `Only ${lockedArt.name} may cast that.` }
      const artController = lockedArt.carriedBy ? state.units[lockedArt.carriedBy]?.controller : lockedArt.conjuredBy
      if (artController !== player) return { ok: false, reason: `Only ${lockedArt.name} may cast that.` }
      if (artifactSilenced(state, lockedArt)) return { ok: false, reason: `${lockedArt.name} can't cast right now.` }
    }
  }

  const caster = resolveCaster(state, casterId, player)
  // An INNATE caster-lock (Omphalos artifacts, Morgana) still binds the caster's OWN element
  // restriction: "any spell it casts must match at least one of its elements" (Omphalos FAQ — an
  // Earth-and-Water Omphalos can't cast a Fire spell it somehow holds). A GRANT-lock (Gabriel's
  // "this unit may cast…") confers casting for that one spell and bypasses element locks, so it is
  // excluded here. (The non-locked path runs the same check below.)
  if (lock && !lock.grantsCasting && caster) {
    const elErr = normalCasterCheck(caster, effKeywords(state, caster), def)
    if (elErr) return { ok: false, reason: elErr }
  }
  if (!lock) {
    if (!caster || caster.controller !== player) return { ok: false, reason: 'Invalid spellcaster.' }
    if (state.units[caster.id] && isDisabled(state, caster)) return { ok: false, reason: `${caster.name} is disabled.` }
    const kw = effKeywords(state, caster)
    // A caster is legal iff the NORMAL Spellcaster path passes, OR the spell's
    // casterFilter EXPANDS the caster set to include it ("May be cast by an allied
    // Mortal/Beast/Dragon/Spirit/Undead/any ally"). Expansion is additive: it never
    // removes the avatar (always a Spellcaster) or normal Spellcaster minions — it
    // only ADDS extra casters who would otherwise fail the Spellcaster check. So we
    // reject only when BOTH arms reject. Element locks (spellcasterElement/Exclude)
    // live on the normal path and still bind a Fire-only Spellcaster casting water.
    const normalErr = normalCasterCheck(caster, kw, def)
    if (normalErr) {
      const casterFilter = getScript(morphed ?? card.name)?.casterFilter
      const expansionErr = casterFilter ? casterFilter(state, caster) : normalErr
      // expansion accepts → legal; else surface the more helpful reason
      if (expansionErr) return { ok: false, reason: casterFilter ? expansionErr : normalErr }
    }
  }
  const costCaster = caster ?? avatarOf(state, player)
  const extra = getScript(morphed ?? card.name)?.extraCastCheck
  if (extra) {
    const err = extra(state, player)
    if (err) return { ok: false, reason: err }
  }
  // use the cheapest achievable cost (position discounts like Camelot count)
  let cost = effectiveCost(state, player, morphed ?? card.name, costCaster, undefined, cardId)
  for (const s of Object.values(state.sites)) {
    cost = Math.min(cost, effectiveCost(state, player, morphed ?? card.name, costCaster, { x: s.x, y: s.y }, cardId))
  }
  // extra summon squares (Harbinger portents) are legal summon spots that also carry a
  // position discount — so a minion only affordable there (e.g. costs mana+1) isn't blocked.
  if (def.type === 'Minion') {
    for (const u of Object.values(state.units)) {
      if (u.silenced || u.controller !== player) continue
      const extra = getScript(u.name)?.extraSummonSquares
      if (extra) for (const sq of extra(state, player)) {
        cost = Math.min(cost, effectiveCost(state, player, morphed ?? card.name, costCaster, sq, cardId))
      }
    }
  }
  // Bureau of Occult Control tolls cemetery casts
  if (!p.hand.includes(cardId) && p.cemetery.includes(cardId)) cost += zoneAccessToll(state)
  const bloodMana = !!state.flow?.bloodMana?.[player] // Blood Mana: pay life instead
  if (bloodMana) {
    if ((avatarOf(state, player).life ?? 0) < cost) return { ok: false, reason: `Not enough life (${cost}).` }
  } else if (p.mana < cost) return { ok: false, reason: `Not enough mana (${p.mana}/${cost}).` }
  if (!ignoresThreshold(state, player, cardId) && !meetsThreshold(affinity(state, player), def.thresholds))
    return { ok: false, reason: 'Elemental threshold not met.' }
  return { ok: true }
}

/** Can `player` afford to cast `name` right now — cheapest position cost within mana,
 *  and elemental threshold met (or waived this turn)? Used to only offer "cast from
 *  your collection" spells you can actually pay for (Silver Bullet, Toolbox, Malleus). */
export function affordable(state: GameState, player: PlayerId, name: string, caster: UnitState): boolean {
  const def = getCard(name)
  const p = state.players[player]
  let cost = effectiveCost(state, player, name, caster)
  for (const s of Object.values(state.sites)) {
    cost = Math.min(cost, effectiveCost(state, player, name, caster, { x: s.x, y: s.y }))
  }
  if (p.mana < cost) return false
  const thresholdWaived = state.flow?.noThreshold?.[player] === state.turn
  if (!thresholdWaived && !meetsThreshold(affinity(state, player), def.thresholds)) return false
  return true
}

/** "This unit may cast X from your collection." — set up an IMMEDIATE cast by the
 *  named caster (paying the cost), rather than drawing the card. The card is lent
 *  into hand just long enough to be cast (vanishes if uncast), locked to the caster
 *  so it can cast it regardless of Spellcaster status, and flagged (`offerCast`) so
 *  the client opens the cast at once. Returns the new card id for extra tagging. */
export function loadCollectionCast(state: GameState, player: PlayerId, name: string, casterId: string): string {
  const cardId = newId(state, 'c')
  state.cards[cardId] = { id: cardId, name, owner: player }
  state.players[player].hand.push(cardId)
  state.flow = state.flow ?? {}
  const casterName = state.units[casterId]?.name ?? state.artifacts[casterId]?.name
  state.flow.lends = [...(state.flow.lends ?? []), { cardId, holder: player, returnTo: 'vanish', owner: player }]
  // "this unit may cast X" grants the caster the ability to cast it (bearer need not
  // be a Spellcaster), like Archangel Gabriel
  state.flow.lockedCards = [...(state.flow.lockedCards ?? []), { cardId, casterId, casterName, grantsCasting: true }]
  state.flow.offerCast = [...(state.flow.offerCast ?? []), { player, cardId }]
  pushLog(state, player, `${name} is loaded — cast it now, paying its cost.`)
  return cardId
}

/** threshold waivers: per-card credits (Sea Raider's plunder, Chaoswish copies),
 *  a per-player this-turn blanket (Wiccan Tools), or a matching one-shot
 *  discount that waives threshold (Four Waters, Mix Aer, Pond) */
export function ignoresThreshold(state: GameState, player: PlayerId, cardId: string, at?: { x: number; y: number }): boolean {
  if ((state.flow?.noThresholdCards ?? []).includes(cardId)) return true
  if (state.flow?.noThreshold?.[player] === state.turn) return true
  // artifacts waiving threshold for their controller (De Vermis Mysteriis)
  for (const a of Object.values(state.artifacts)) {
    const controller = a.carriedBy ? state.units[a.carriedBy]?.controller : a.conjuredBy
    if (controller !== player) continue
    const f = getScript(a.name)?.grantsNoThreshold
    if (f && f(state, a.id, cardId)) return true
  }
  // sites with a continuous threshold waiver for cards cast onto them (Dragonlord's Lair:
  // Dragons). Mirrors the artifact grantsNoThreshold scan above.
  for (const s of Object.values(state.sites)) {
    if (s.isRubble || siteSilenced(state, s)) continue
    const f = getScript(s.name)?.siteGrantsNoThreshold
    if (f && f(state, s, cardId, at)) return true
  }
  const cardName = state.cards[cardId]?.name
  if (!cardName) return false
  for (const d of state.flow?.spellDiscounts ?? []) {
    // position-bound waivers are optimistic in canCast (at unknown) and
    // verified for real in castSpell with the chosen square
    if (d.noThreshold && spellDiscountMatches(state, d, player, cardName, at, at === undefined)) return true
  }
  // Tournament Grounds: Knights/Sirs/Dames cast to it need no threshold
  if (/\b(Knight|Sir|Dame)\b/.test(cardName) || getCard(cardName).subtypes.includes('Knight')) {
    for (const s of Object.values(state.sites)) {
      if (s.isRubble || !getScript(s.name)?.knightsNeedNoThresholdHere || siteSilenced(state, s)) continue
      if (at === undefined || (at.x === s.x && at.y === s.y)) return true
    }
  }
  return false
}

/** one-shot discount entries in flow.spellDiscounts */
export interface SpellDiscount {
  player: PlayerId
  turn: number
  amount: number
  noThreshold?: boolean
  /** any of these elements must appear on the card (null = any spell) */
  elements?: string[] | null
  /** restrict the discount to a spell cast BY this specific caster (Merlin's Tower — "ITS next magic") */
  casterId?: string
  /** required subtype, e.g. Beast (Pond) */
  subtype?: string | null
  /** the card must be Evil (Den of Evil) */
  evil?: boolean
  /** required cast location (Pond) */
  at?: { x: number; y: number } | null
}

export function spellDiscountMatches(
  state: GameState,
  d: SpellDiscount,
  player: PlayerId,
  cardName: string,
  at?: { x: number; y: number },
  lenientAt = false,
  casterId?: string,
): boolean {
  if (d.player !== player || d.turn !== state.turn) return false
  if (d.casterId && d.casterId !== casterId) return false // "ITS next magic" — only when that caster casts
  const def = getCard(cardName)
  if (d.elements && !def.elements.some((e) => d.elements!.includes(e))) return false
  if (d.subtype && !cardSubtypesFor(state, player, cardName).includes(d.subtype)) return false
  if (d.evil && !isEvilCardNameFor(state, player, cardName)) return false
  if (d.at && !lenientAt) {
    if (!at || at.x !== d.at.x || at.y !== d.at.y) return false
  }
  return true
}

/** validate a chosen target against a spec (targeted → same region as caster,
 *  stealth/ward interplay). Then Blasted Oak's compulsion gets its say. */
export function validateTarget(
  state: GameState,
  spec: TargetSpec,
  ref: TargetRef,
  caster: UnitState,
  player: PlayerId,
  /** the targets already picked this cast — lets `spec.whereOf` anchor `where` to an earlier target. */
  picked?: TargetRef[],
): string | null {
  const err = validateTargetCore(state, spec, ref, caster, player, picked)
  if (err) return err
  return targetCompulsion(state, spec, ref, caster, player)
}

/** The engine-authoritative legal-target set for a card's pick at `specIndex`, given the targets
 *  already picked this cast — the single source of truth for interdependent/spatial picks (see
 *  CardScript.targetOptions: explosion step-range, Meteor Shower's no-shared-border rule). Returns
 *  null when the card declares no such hook, so the caller falls back to per-spec validateTarget. */
export function legalTargetOptions(
  state: GameState,
  script: CardScript | null | undefined,
  caster: UnitState,
  picked: TargetRef[],
  specIndex: number,
): TargetRef[] | null {
  if (!script?.targetOptions) return null
  try {
    return script.targetOptions(state, caster, picked, specIndex)
  } catch {
    return null
  }
}

/** structural equality of two target refs (same unit/site/artifact/aura, or same square). */
export function sameTargetRef(a: TargetRef, b: TargetRef): boolean {
  if ('unit' in a && 'unit' in b) return a.unit === b.unit
  if ('site' in a && 'site' in b) return a.site === b.site
  if ('artifact' in a && 'artifact' in b) return a.artifact === b.artifact
  if ('aura' in a && 'aura' in b) return (a as any).aura === (b as any).aura
  if ('square' in a && 'square' in b) return a.square.x === b.square.x && a.square.y === b.square.y
  return false
}

/** 'If a spell or non-basic ability can target—in order of precedence—Blasted
 *  Oak, its site or location, or anything else at its site or location, it must.' */
function targetCompulsion(
  state: GameState,
  spec: TargetSpec,
  ref: TargetRef,
  caster: UnitState,
  player: PlayerId,
): string | null {
  const oaks = Object.values(state.artifacts).filter((a) => artScript(state, a)?.compelsTargets) // silenced Oak doesn't compel
  if (!oaks.length) return null
  const ok = (r: TargetRef) => !validateTargetCore(state, spec, r, caster, player)
  // precedence 1: a compelling artifact itself
  const targetableOaks = oaks.filter((a) => spec.what === 'artifact' && ok({ artifact: a.id }))
  if (targetableOaks.length) {
    return 'artifact' in ref && targetableOaks.some((a) => a.id === ref.artifact)
      ? null
      : `${targetableOaks[0].name} compels — it must be targeted.`
  }
  // precedence 2: its site or location
  for (const oak of oaks) {
    const loc = oak.carriedBy ? state.units[oak.carriedBy] : oak
    if (!loc) continue
    const site = siteAt(state, loc.x, loc.y)
    const siteOk = !!site && spec.what === 'site' && ok({ site: site.id })
    const sqOk = spec.what === 'square' && ok({ square: { x: loc.x, y: loc.y } })
    if (siteOk || sqOk) {
      const chose =
        ('site' in ref && !!site && ref.site === site.id) ||
        ('square' in ref && ref.square.x === loc.x && ref.square.y === loc.y)
      return chose ? null : `${oak.name} compels — target its site or location.`
    }
  }
  // precedence 3: anything else at its site or location
  for (const oak of oaks) {
    const loc = oak.carriedBy ? state.units[oak.carriedBy] : oak
    if (!loc) continue
    const here: TargetRef[] = [
      ...Object.values(state.units).filter((u) => occupies(u, loc.x, loc.y)).map((u) => ({ unit: u.id })),
      ...Object.values(state.artifacts).filter((a) => !a.carriedBy && a.x === loc.x && a.y === loc.y).map((a) => ({ artifact: a.id })),
    ]
    const legal = here.filter(ok)
    if (legal.length) {
      const chose = legal.some(
        (r) =>
          ('unit' in r && 'unit' in ref && r.unit === ref.unit) ||
          ('artifact' in r && 'artifact' in ref && r.artifact === ref.artifact),
      )
      return chose ? null : `${oak.name} compels — target something at its location.`
    }
  }
  return null
}

/** the x/y a `where` bound is measured from: a previously-picked target (spec.whereOf) if given, else the
 *  caster — so Blink's square is checked against the ally you selected, not the caster. */
function whereAnchor(state: GameState, spec: TargetSpec, caster: UnitState, picked?: TargetRef[]): { x: number; y: number } {
  const ref = spec.whereOf != null ? picked?.[spec.whereOf] : undefined
  if (ref) {
    if ('unit' in ref) { const u = state.units[ref.unit]; if (u) return { x: u.x, y: u.y } }
    else if ('site' in ref) { const s = state.sites[ref.site]; if (s) return { x: s.x, y: s.y } }
    else if ('artifact' in ref) { const a = state.artifacts[ref.artifact]; if (a) return { x: a.x, y: a.y } }
    else if ('aura' in ref) { const r = state.auras[ref.aura]; const sq = r?.squares?.[0]; if (sq) return { x: sq.x, y: sq.y } }
    else if ('square' in ref) return { x: ref.square.x, y: ref.square.y }
  }
  return { x: caster.x, y: caster.y }
}

function validateTargetCore(
  state: GameState,
  spec: TargetSpec,
  ref: TargetRef,
  caster: UnitState,
  player: PlayerId,
  picked?: TargetRef[],
): string | null {
  const wa = whereAnchor(state, spec, caster, picked)
  if ('unit' in ref) {
    const unit = state.units[ref.unit]
    if (!unit) return 'No such unit.'
    // A blanked face-down husk (flipped to a side it lacks) has no card type and is no longer a
    // unit/minion — no targeted effect can choose it (FAQ). It's only swept by "destroy everything".
    if (isBlanked(unit)) return 'That card is face down — it has no card type.'
    if (carriedInside(state, unit)) return 'That unit is swallowed — it can\'t be targeted.'
    if ((spec.what === 'minion' || spec.what === 'minionOrArtifact' || spec.what === 'minionArtifactOrAura') && unit.isAvatar) return 'Avatars are not minions.'
    if (spec.what === 'avatar' && !unit.isAvatar) return 'Must target an Avatar.'
    // automatons are minions AND artifacts (codex) — artifact specs reach them
    if (spec.what === 'artifact' && !isArtifactUnit(state, unit)) return 'Wrong target type.'
    if (spec.what === 'site' || spec.what === 'square') return 'Wrong target type.'
    if (spec.owner === 'ally' && unit.controller !== player) return 'Must choose an ally.'
    if (spec.owner === 'enemy' && unit.controller === player) return 'Must choose an enemy.'
    if (spec.targeted) {
      // "target" keyword: same region as the caster, and stealth blocks it
      if (unit.region !== caster.region) return 'Targets must be in the same region as the caster.'
      if (unit.stealth && unit.controller !== player) return 'That minion has Stealth.'
      // targeting sanctuaries (Varmint Warrens: Beasts here can't be targeted by enemies)
      if (unit.controller !== player) {
        for (const s of Object.values(state.sites)) {
          const f = getScript(s.name)?.protectsFromTargeting
          if (f && !s.isRubble && !siteSilenced(state, s) && f(state, s, unit)) return `${unit.name} is protected there.`
        }
      }
    }
    if (spec.where && spec.where !== 'anywhere') {
      const squares = spec.where === 'here' ? [{ x: wa.x, y: wa.y }] : spec.where === 'adjacent' ? adjacentSquaresW(state, wa.x, wa.y) : nearbySquaresW(state, wa.x, wa.y)
      if (!squares.some((s) => s.x === unit.x && s.y === unit.y)) return `Target must be ${spec.where}.`
      // a here/nearby/adjacent UNIT target is region-locked to a real-UNIT source's region (a card
      // that reaches across regions says so and targets imperatively, e.g. Lacuna Entity). A SITE /
      // positional pseudo-caster (not in state.units) still reaches sub-surface targets.
      if (state.units[caster.id] && unit.region !== caster.region) return 'Target must be in the same region.'
    }
    if (spec.filter && !spec.filter(state, unit, caster)) return 'Not a legal target.'
    return null
  }
  if ('site' in ref) {
    const site = state.sites[ref.site]
    if (!site) return 'No such site.'
    if (spec.what !== 'site') return 'Wrong target type.'
    if (spec.owner === 'ally' && site.controller !== player) return 'Must choose your own site.'
    if (spec.owner === 'enemy' && (site.controller === player || site.controller === null)) return 'Must choose an enemy site.'
    if (spec.where && spec.where !== 'anywhere') {
      const squares = spec.where === 'here' ? [{ x: wa.x, y: wa.y }] : spec.where === 'adjacent' ? adjacentSquaresW(state, wa.x, wa.y) : nearbySquaresW(state, wa.x, wa.y)
      if (!squares.some((s) => s.x === site.x && s.y === site.y)) return `Target must be ${spec.where}.`
    }
    if (spec.filter && !spec.filter(state, site, caster)) return 'Not a legal target.'
    return null
  }
  if ('artifact' in ref) {
    if (spec.what !== 'artifact' && spec.what !== 'minionOrArtifact' && spec.what !== 'minionArtifactOrAura') return 'Wrong target type.'
    const art = state.artifacts[ref.artifact]
    if (!art) return 'No such artifact.'
    if (spec.filter && !spec.filter(state, art, caster)) return 'Not a legal target.'
    return null
  }
  if ('aura' in ref) {
    if (spec.what !== 'minionArtifactOrAura') return 'Wrong target type.'
    const aura = state.auras[ref.aura]
    if (!aura) return 'No such aura.'
    if (spec.filter && !spec.filter(state, aura, caster)) return 'Not a legal target.'
    return null
  }
  if ('square' in ref) {
    if (spec.what !== 'square') return 'Wrong target type.'
    if (!inBounds(ref.square.x, ref.square.y)) return 'Out of bounds.'
    // enforce the spatial bound (Draconian Bonekite's "target nearby location") — the unit/site
    // branches already do this; without it a `where:'nearby'` SQUARE spec validated the whole board.
    if (spec.where && spec.where !== 'anywhere') {
      const squares = spec.where === 'here' ? [{ x: wa.x, y: wa.y }] : spec.where === 'adjacent' ? adjacentSquaresW(state, wa.x, wa.y) : nearbySquaresW(state, wa.x, wa.y)
      if (!squares.some((s) => s.x === ref.square.x && s.y === ref.square.y)) return `Target must be ${spec.where}.`
    }
    return null
  }
  return 'Invalid target.'
}

function parseTargetRefs(raw: string[] | undefined): TargetRef[] {
  const out: TargetRef[] = []
  for (const r of raw ?? []) {
    if (r.startsWith('sq:')) {
      const [x, y, region] = r.slice(3).split(',')
      out.push({ square: { x: Number(x), y: Number(y), region: region as Region | undefined } })
    } else if (r.startsWith('u')) out.push({ unit: r })
    else if (r.startsWith('s')) out.push({ site: r })
    else if (r.startsWith('a')) out.push({ artifact: r })
    else if (r.startsWith('r')) out.push({ aura: r })
  }
  return out
}

/** Summon a just-cast minion into the realm and fire its Genesis / castRider. Split out of castSpell
 *  so it can run inline (the common case) OR be deferred behind a "when you cast" trigger's prompt
 *  (Enchantress — see resolvePendingSummon). Re-derives everything from the card, so it survives the
 *  round-trip through a prompt. */
function summonCastMinion(
  state: GameState,
  cardId: string,
  castName: string,
  player: PlayerId,
  at: { x: number; y: number; region?: Region } | undefined,
  targets: ReturnType<typeof parseTargetRefs>,
  extra: any,
): void {
  const card = state.cards[cardId]
  if (!card || !at) return
  const def = getCard(castName)
  const script = getScript(castName)
  const unitId = newId(state, 'u')
  const kw = getKeywords(def.name)
  const unit: UnitState = {
    id: unitId,
    cardId,
    name: card.name,
    owner: card.owner,
    controller: player,
    isAvatar: false,
    x: at.x,
    y: at.y,
    region: at.region ?? 'surface',
    tapped: false,
    damage: 0,
    enteredTurn: state.turn,
    modifiers: [],
    carrying: [],
    carryingUnits: [],
    usedThisTurn: {},
    stealth: kw.stealth || undefined,
    ward: kw.ward || undefined,
    size: script?.oversized ? '2x2' : undefined,
    counters: { castFromHand: 1 }, // real casts, vs script-summons (Order of the White Wing)
  }
  state.units[unitId] = unit
  // rulebook: "Evil minions can't be warded" — strip a printed Ward that seeded onto an entering Evil
  // minion (defensive against future data / subtype-override entrants). Avatars keep it.
  if (unit.ward && !unit.isAvatar && isEvilUnit(state, unit)) unit.ward = undefined
  // Lance: the minion enters play carrying a Lance artifact token
  if (kw.lance) {
    const lanceCardId = newId(state, 'c')
    state.cards[lanceCardId] = { id: lanceCardId, name: 'Lance', owner: player, isToken: true }
    const lanceId = newId(state, 'a')
    state.artifacts[lanceId] = {
      id: lanceId, cardId: lanceCardId, name: 'Lance', conjuredBy: player,
      x: unit.x, y: unit.y, region: unit.region, carriedBy: unitId, tapped: false,
    }
    unit.carrying.push(lanceId)
  }
  // It is ENTERING — not yet "at rest" — so an at-rest disabler (Hillock Basilisk) can't bite it until
  // its Genesis, INCLUDING any prompt it raises, fully resolves. (An Archangel Michael cast in front of
  // a Basilisk thus takes its step + strike, and keeps its Ward, before it ever comes to rest.)
  state.flow = state.flow ?? {}
  const prevActing = state.flow.actingUnitId
  state.flow.actingUnitId = unitId
  state.flow.entering = [...(((state.flow.entering as string[] | undefined)) ?? []), unitId]
  emitUnitEnters(state, unit)
  const promptsBefore = state.prompts.length
  // Genesis + cast-rider are one simultaneous damage event (a Genesis that blasts an area — Wraetannis
  // Titan, Vile Imp — resolves reduction/prevention across every victim before any death settles).
  runDamageEvent(state, () => {
    // a minion enters with no abilities to fire — silenced, hushed by a static silence (Silent Hills),
    // or already disabled by an OUTSIDE source (atop a burrowed Root Spider, an area-disable) — so it
    // fires no Genesis. Shared predicate with the effect-summon path (a Slumbering Giantess summoned
    // already-disabled must never add her own "fall asleep" whichever way she enters).
    if (script?.genesis && firesGenesisOnEntry(state, unit)) {
      script.genesis(makeCtx(state, unitId, player, targets, at, extra))
    }
    // cast-only riders (Mephistopheles' avatar replacement — "Must be cast...", NOT a Genesis ability;
    // faq_dump.md:1954) fire only on a real cast, right here where genesis fires.
    if (script?.castRider && state.units[unitId]) {
      script.castRider(makeCtx(state, unitId, player, targets, at, extra))
    }
  })
  state.flow.actingUnitId = prevActing
  if (state.prompts.length > promptsBefore) deferTurnStep(state, 'summon:settle', { unitId }) // wait for the Genesis prompt(s)
  else settleEntering(state, unitId)
  checkStateBased(state)
}

/** Resolve the caster for a cast the same way castSpell does (honoring caster-locked cards). Shared so
 *  a deferred Magic resolution re-derives the same caster it would have used inline. */
function resolveCasterForCast(state: GameState, player: PlayerId, cardId: string, casterId: string): UnitState {
  const lock = (state.flow?.lockedCards ?? []).find((e: any) => e.cardId === cardId)
  return (lock ? resolveCaster(state, lock.casterId, player) : undefined) ?? resolveCaster(state, casterId, player) ?? avatarOf(state, player)
}

/** Resolve a just-cast Magic (its onCast + cemetery/banish + reveal). Split out of castSpell so it can
 *  run inline OR be deferred behind an Enchantress animate prompt. */
function resolveMagicCast(state: GameState, cardId: string, castName: string, player: PlayerId, casterId: string, targets: ReturnType<typeof parseTargetRefs>, at: any, extra: any, fromCemetery: boolean): void {
  const card = state.cards[cardId]
  if (!card) return
  const def = getCard(castName)
  const script = getScript(castName)
  const caster = resolveCasterForCast(state, player, cardId, casterId)
  // a multi-region SITE caster chose which region to blast (see the region prompt below); makeCtx places
  // ctx.caster in that region, and the square targets it resolves against must sit in the same region.
  if (extra?.castRegion) {
    for (const ref of targets) if ('square' in ref && (ref as any).square) (ref as any).square.region = extra.castRegion
    if (at) at.region = extra.castRegion
  }
  const snap = snapshotRealm(state)
  const prevCredit = setActionCredit(state, 2, [caster.id])
  if (script?.onCast) {
    // one simultaneous damage event: any minion the spell hurts (an area blast) resolves all its
    // reduction/prevention before a single death is settled (see runDamageEvent).
    runDamageEvent(state, () => script.onCast!(makeCtx(state, caster.id, player, targets, at, extra, { kind: 'magic', name: castName, elements: def.elements })))
  }
  const forcedBanish = (state.flow?.banishAfterCast ?? []).includes(cardId)
  if (forcedBanish) state.flow.banishAfterCast = state.flow.banishAfterCast.filter((id: string) => id !== cardId)
  if ((fromCemetery && script?.castFromCemetery?.banishAfter) || forcedBanish) {
    state.players[card.owner].banished.push(cardId)
    pushLog(state, player, `${card.name} burns away for good.`)
  } else {
    toCemetery(state, cardId) // honors Mismanaged Mortuary / Kor Crematory
  }
  checkStateBased(state)
  restoreActionCredit(state, prevCredit)
  recordTouchedSites(state, snap)
  sealSpellReveal(state)
}

/** Conjure a just-cast Artifact (+ its Genesis). Split out for the same deferral. */
function resolveArtifactCast(state: GameState, cardId: string, castName: string, player: PlayerId, at: any, targets: ReturnType<typeof parseTargetRefs>, extra: any): void {
  const card = state.cards[cardId]
  if (!card) return
  const script = getScript(castName)
  const artId = newId(state, 'a')
  const holder = extra?.giveTo ? state.units[extra.giveTo] : null
  state.artifacts[artId] = {
    id: artId, cardId, name: card.name, conjuredBy: player,
    x: holder ? holder.x : at!.x, y: holder ? holder.y : at!.y,
    region: holder ? holder.region : at?.region ?? 'surface', carriedBy: holder ? holder.id : null, tapped: false,
  }
  if (holder) holder.carrying.push(artId)
  // "provides" artifacts grant their mana on entry too (Cores FAQ)
  const provides = getScript(card.name)?.extraManaEachTurn
  if (provides) {
    const n = typeof provides === 'function' ? provides(state, artId) : provides
    const controller = holder ? holder.controller : player
    if (n > 0) {
      state.players[controller].mana += n
      const art = state.artifacts[artId]
      if (art) recordManaGain(state, holder?.x ?? art.x, holder?.y ?? art.y, holder?.region ?? art.region, n)
      pushLog(state, controller, `${card.name} provides ${n} mana.`)
    }
  }
  if (script?.genesis) script.genesis(makeCtx(state, artId, player, targets, at, extra))
  checkStateBased(state)
}

/** Place a just-cast Aura (+ its Genesis). Split out for the same deferral. */
function resolveAuraCast(state: GameState, cardId: string, castName: string, player: PlayerId, at: any, targets: ReturnType<typeof parseTargetRefs>, extra: any): void {
  const card = state.cards[cardId]
  if (!card || !at) return
  const script = getScript(castName)
  const auraId = newId(state, 'r')
  const single = !!script?.singleSiteAura
  const squares = single ? [{ x: at.x, y: at.y }] : aura2x2Squares(at, edgesConnected(state))
  state.auras[auraId] = { id: auraId, cardId, name: card.name, controller: player, squares, ...(single ? {} : { anchor: { x: at.x, y: at.y } }), enteredTurn: state.turn }
  if (script?.genesis) script.genesis(makeCtx(state, auraId, player, targets, at, extra))
  const placed = state.auras[auraId]
  if (placed && placed.squares !== squares) delete placed.anchor // genesis-managed footprint (Wildfire)
  checkStateBased(state)
}

/** Finish a cast that was parked behind the Enchantress's "you may animate an aura" prompt. Runs at
 *  the applyAction boundary once the prompt queue clears, so the spell resolves (minion enters + its
 *  Genesis, magic's onCast, artifact/aura placement) only AFTER the animate fully resolved. */
export function resolvePendingCast(state: GameState): void {
  if (state.prompts.length > 0) return
  const p = state.flow?.pendingCast as
    | { type: 'minion' | 'magic' | 'artifact' | 'aura'; cardId: string; castName: string; player: PlayerId; casterId: string; at: any; targets: ReturnType<typeof parseTargetRefs>; extra: any; fromCemetery: boolean }
    | undefined
  if (!p) return
  state.flow.pendingCast = undefined
  if (p.type === 'minion') summonCastMinion(state, p.cardId, p.castName, p.player, p.at, p.targets, p.extra)
  else if (p.type === 'magic') resolveMagicCast(state, p.cardId, p.castName, p.player, p.casterId, p.targets, p.at, p.extra, p.fromCemetery)
  else if (p.type === 'artifact') resolveArtifactCast(state, p.cardId, p.castName, p.player, p.at, p.targets, p.extra)
  else if (p.type === 'aura') resolveAuraCast(state, p.cardId, p.castName, p.player, p.at, p.targets, p.extra)
}

// A site caster picked the region to blast from → stamp it onto the parked cast; the applyAction
// boundary (game.ts) then runs resolvePendingCast to finish the spell in that region.
registerCont('cast:region', (state, _ctx, choice) => {
  const pc = state.flow?.pendingCast as any
  if (pc) pc.extra = { ...(pc.extra ?? {}), castRegion: typeof choice === 'string' ? choice : 'surface' }
})

// An oversized caster picked which of its squares to fire from → stamp it onto the parked cast.
registerCont('cast:origin', (state, _ctx, choice) => {
  const pc = state.flow?.pendingCast as any
  if (pc && isSquare(choice)) pc.extra = { ...(pc.extra ?? {}), castOrigin: { x: choice.x, y: choice.y } }
})

export function castSpell(
  state: GameState,
  player: PlayerId,
  cardId: string,
  casterId: string,
  at?: { x: number; y: number; region?: Region },
  rawTargets?: string[],
  extra?: any,
): string | null {
  const check = canCast(state, player, cardId, casterId)
  if (!check.ok) return check.reason!
  const p = state.players[player]
  const card = state.cards[cardId]
  // hand-card morphs resolve as the substitute spell (Avatar of Fire's Fireballs)
  const morphed = p.hand.includes(cardId) ? spellMorphName(state, player, card.name) : null
  const castName = morphed ?? card.name
  const def = getCard(castName)
  // caster-locked cards resolve with their bonded caster (avatar stands in for
  // targeting geometry when the caster is an artifact)
  const lock = (state.flow?.lockedCards ?? []).find((e: any) => e.cardId === cardId)
  // caster-locked cards resolve with their bonded caster; a spellcaster ARTIFACT (Omphalos)
  // resolves to a pseudo-caster at its own square (its minions "must be summoned here").
  const caster = (lock ? resolveCaster(state, lock.casterId, player) : undefined) ?? resolveCaster(state, casterId, player) ?? avatarOf(state, player)
  const script = getScript(castName)
  const targets = parseTargetRefs(rawTargets)

  // projectile spells need a cardinal direction chosen at cast time; refuse to
  // consume the card without one (the client shows a direction picker)
  if (def.type === 'Magic' && script?.shootsProjectile && !['n', 's', 'e', 'w'].includes(extra?.direction)) {
    return 'Choose a direction to shoot.'
  }

  // validate declared targets
  const specs = def.type === 'Magic' ? script?.targets ?? [] : script?.genesisTargets ?? []
  let needed = 0
  for (const spec of specs) needed += spec.upTo ? 0 : spec.count
  if (targets.length < needed) return 'Missing targets.'
  // A minion's Genesis targets are measured from WHERE THE MINION LANDS (`at`) —
  // "adjacent"/positional specs are relative to the summoned minion, not the caster
  // (Gargantula drags an adjacent minion to its own square). Validate those against a
  // pseudo-caster placed at `at`. Magic spells keep the real caster as the anchor.
  const targetAnchor: UnitState =
    def.type === 'Magic' || !at ? caster : { ...caster, x: at.x, y: at.y, region: at.region ?? caster.region }
  let ti = 0
  for (let si = 0; si < specs.length; si++) {
    const spec = specs[si]
    for (let i = 0; i < spec.count && ti < targets.length; i++, ti++) {
      const err = validateTarget(state, spec, targets[ti], targetAnchor, player, targets)
      if (err) return err
      // engine-authoritative legal set for spatial/interdependent picks (explosion range, Meteor
      // Shower's no-shared-border) — reject anything the card's targetOptions wouldn't offer, so an
      // illegal pick is refused up front instead of fizzling mid-resolution and wasting the spell.
      const opts = legalTargetOptions(state, script, targetAnchor, targets.slice(0, ti), si)
      if (opts && !opts.some((o) => sameTargetRef(o, targets[ti]))) return 'Not a legal target.'
      // magic-protection blocks targeting by enemy Magic spells
      const ref = targets[ti]
      if (def.type === 'Magic' && 'unit' in ref) {
        const tu = state.units[ref.unit]
        if (tu && tu.controller !== player && isMagicProtected(state, tu)) {
          return `${tu.name} can't be targeted by magic.`
        }
      }
    }
  }

  // The Malleus Maleficarum: its collection-casts must aim at an enemy
  // Spellcaster, or their location or site
  if ((state.flow?.malleusCast ?? []).includes(cardId)) {
    const isEnemyCaster = (u: UnitState | undefined) =>
      !!u && u.controller !== player && !!effKeywords(state, u).spellcaster
    const hits = targets.some((ref) => {
      if ('unit' in ref) return isEnemyCaster(state.units[ref.unit])
      if ('square' in ref) return unitsAt(state, ref.square.x, ref.square.y).some((u) => isEnemyCaster(u))
      if ('site' in ref) {
        const s = state.sites[ref.site]
        return !!s && unitsAt(state, s.x, s.y, 'surface').some((u) => isEnemyCaster(u))
      }
      return false
    })
    if (!hits) return 'The Malleus Maleficarum demands a target: an enemy Spellcaster, or their location or site.'
    state.flow.malleusCast = state.flow.malleusCast.filter((id: string) => id !== cardId)
  }

  // placement validation for permanents
  if (def.type === 'Minion') {
    // Mimic transform: instead of a normal square-summon, the caster may pick a carriable
    // artifact anywhere (ground/carried/enemy/subsurface). The Mimic materializes at that
    // artifact's exact location+region under the caster's control (validated against the
    // artifact itself, NOT the client-sent `at`, to stay authoritative), and the artifact is
    // consumed by the Mimic's genesis (via extra.mimicArtifact).
    if (castName === 'Mimic' && extra?.mimicArtifact) {
      const art = state.artifacts[extra.mimicArtifact]
      if (!art) return 'No such artifact.'
      if (!isCarriableArtifact(art.name)) return "That artifact can't be transformed."
      at = { x: art.x, y: art.y, region: art.region }
    } else {
      if (!at) return 'Choose where to summon.'
      // per-instance placement locks (Cradle of Etherrum, Doomsday Cult)
      const lock = (state.flow?.castAtOnly ?? []).find((e: any) => e.cardId === cardId)
      // a lock may also bind the REGION (an Omphalos summons "here" = its own layer, which can be
      // buried/submerged); when it does, the minion must materialize at that exact location + region.
      if (lock && (lock.x !== at.x || lock.y !== at.y || (lock.region !== undefined && at.region !== undefined && lock.region !== at.region)))
        return 'That card must be cast to its bound location.'
      const err = validateSummonAt(state, player, castName, at)
      if (err) return err
    }
  }
  if (def.type === 'Artifact') {
    if (!at && !extra?.giveTo) return 'Choose where to conjure the artifact.'
    if (at) {
      const site = siteAt(state, at.x, at.y)
      // Dwarven Forge: anyone may conjure (matching) artifacts here
      const forge = site && !siteSilenced(state, site) && (() => {
        const f = getScript(site.name)?.siteAllowsAnyConjure
        return f === true || (typeof f === 'function' && f(state, castName))
      })()
      if (!site || (site.controller !== player && !forge)) return 'Artifacts are conjured atop a site you control.'
      // placement restrictions (The Round Table's back row)
      const filter = getScript(castName)?.conjureFilter
      if (filter) {
        const err = filter(state, player, at)
        if (err) return err
      }
    }
    if (extra?.giveTo) {
      const holder = state.units[extra.giveTo]
      const enemyOk = !!getScript(castName)?.conjureToEnemy
      if (!holder || (!enemyOk && holder.controller !== player)) return 'You can only hand an artifact to your own unit.'
    }
  }
  if (def.type === 'Aura') {
    if (!at) return 'Choose where the aura goes.'
    const aScript = getScript(castName)
    // a plain 2x2 aura's area must FULLY FIT in the realm — unless a Magellan Globe connects the edges,
    // which lets it wrap around a corner onto the far side (FAQ). Single-site + edge (wall) auras exempt.
    if (!aScript?.singleSiteAura && !(aScript as { edgeAura?: boolean } | undefined)?.edgeAura) {
      const wrap = edgesConnected(state)
      if (at.x < 0 || at.x >= GRID_W || at.y < 0 || at.y >= GRID_H) return 'The two-by-two area must fit inside the realm.'
      if (!wrap && (at.x >= GRID_W - 1 || at.y >= GRID_H - 1)) return 'The two-by-two area must fit inside the realm — raise a Magellan Globe to wrap it around the edge.'
    }
    const placement = aScript?.auraPlacement
    if (placement) {
      const err = placement(state, player, at, caster)
      if (err) return err
    }
  }

  // canCast's threshold pass is optimistic for position-bound waivers; verify
  // with the real square now
  if (!meetsThreshold(affinity(state, player), def.thresholds) && !ignoresThreshold(state, player, cardId, at ?? undefined))
    return 'Elemental threshold not met.'

  // pay costs (site/aura discounts see the destination square); the Bureau of
  // Occult Control tolls cemetery casts
  const cemToll = !p.hand.includes(cardId) && p.cemetery.includes(cardId) ? zoneAccessToll(state) : 0
  const finalCost = effectiveCost(state, player, castName, caster, at, cardId) + cemToll
  if (state.flow?.bloodMana?.[player]) {
    // Blood Mana: this spell costs life instead of mana
    if ((avatarOf(state, player).life ?? 0) < finalCost) return `Not enough life (${finalCost}).`
    delete state.flow.bloodMana[player]
    loseLife(state, player, finalCost)
  } else {
    if (p.mana < finalCost) return `Not enough mana (${p.mana}/${finalCost}).`
    p.mana -= finalCost
    bumpManaSpent(state, player, finalCost)
  }
  // one-shot discounts are spent by the first matching cast
  if (state.flow?.spellDiscounts?.length) {
    const idx = state.flow.spellDiscounts.findIndex((d: any) => spellDiscountMatches(state, d, player, castName, at ?? undefined, false, caster?.id))
    if (idx >= 0) {
      const consumed = state.flow.spellDiscounts[idx]
      state.flow.spellDiscounts.splice(idx, 1)
      // An X-cost spell (Arcane Barrage) pays X as mana during resolution; its printed cost is 0, so the
      // discount above reduced nothing. Carry it to the spell to subtract from X ("3 less", free if X<=3).
      if (getScript(castName)?.xCostSpell) state.flow.xCostDiscount = { amount: consumed.amount, player }
    }
  }
  // spent threshold credits
  if (state.flow?.noThresholdCards?.includes(cardId)) {
    state.flow.noThresholdCards = state.flow.noThresholdCards.filter((id: string) => id !== cardId)
  }
  // plundered/lent cards were cast — no need to return them
  if (state.flow?.plunder?.length) {
    state.flow.plunder = state.flow.plunder.filter((e: any) => e.cardId !== cardId)
  }
  if (state.flow?.lends?.length) {
    state.flow.lends = state.flow.lends.filter((e: any) => e.cardId !== cardId)
  }
  if (state.flow?.castAtOnly?.length) {
    state.flow.castAtOnly = state.flow.castAtOnly.filter((e: any) => e.cardId !== cardId)
  }
  if (state.flow?.lockedCards?.length) {
    state.flow.lockedCards = state.flow.lockedCards.filter((e: any) => e.cardId !== cardId)
  }
  if (state.flow?.offerCast?.length) {
    state.flow.offerCast = state.flow.offerCast.filter((e: any) => e.cardId !== cardId)
  }
  if (state.flow?.freeCast?.includes(cardId)) {
    state.flow.freeCast = state.flow.freeCast.filter((id: string) => id !== cardId)
  }
  const fromCemetery = !p.hand.includes(cardId) && p.cemetery.includes(cardId)
  if (fromCemetery) p.cemetery.splice(p.cemetery.indexOf(cardId), 1)
  else p.hand.splice(p.hand.indexOf(cardId), 1)
  // casting a spell "interacts with the realm" (Codex — Stealth) → this caster can't Drop
  // this turn AND loses its Stealth token (a Stealthed Morgana le Fay is revealed when she
  // casts one of her locked spells). Avatars have no Stealth, so this only bites minions.
  if (caster && state.units[caster.id]) {
    caster.interactedTurn = state.turn
    if (caster.stealth) {
      caster.stealth = false
      pushLog(state, player, `${caster.name} loses Stealth.`)
    }
  }
  pushLog(state, player, `${p.name} casts ${card.name}${morphed ? ` as ${castName}` : ''}${caster.isAvatar ? '' : ` with ${caster.name}`}.`)
  state.lastPlay = { name: morphed ? castName : card.name, player, n: (state.lastPlay?.n ?? 0) + 1 }
  // codex: an OPPONENT's targeting breaks wards instead — the spell's effect
  // skips the warded target (costs stay paid)
  {
    let wi = 0
    for (const spec of specs) {
      for (let i = 0; i < spec.count && wi < targets.length; i++, wi++) {
        if (!spec.targeted) continue
        const ref = targets[wi]
        if ('unit' in ref) {
          const tu = state.units[ref.unit]
          if (tu && checkWard(state, tu, player, tu.controller, 'target')) {
            pushLog(state, player, `${tu.name}'s ward breaks — the spell cannot touch it.`)
            targets[wi] = { unit: '__warded__' }
          }
        } else if ('site' in ref) {
          const ts = state.sites[ref.site]
          if (ts && checkWard(state, ts, player, ts.controller, 'target')) {
            pushLog(state, player, `${ts.name}'s ward breaks — the spell cannot touch it.`)
            targets[wi] = { site: '__warded__' }
          }
        }
      }
    }
  }
  // "whenever X targets a minion" (Sir Kay)
  {
    const hook = !caster.silenced ? getScript(caster.name)?.onTargetsUnit : undefined
    if (hook) {
      for (const ref of targets) {
        if ('unit' in ref && state.units[ref.unit]) hook(makeCtx(state, caster.id, player, []), state.units[ref.unit])
      }
    }
  }
  // per-turn air-threshold tally (Sparkmage)
  state.flow = state.flow ?? {}
  state.flow.airCastSum = state.flow.airCastSum ?? { 0: 0, 1: 0 }
  state.flow.airCastSum[player] += def.thresholds.air
  // "When you cast a spell" triggers resolve BEFORE the spell itself resolves. For now this deferral
  // is scoped to the Enchantress's "you may animate an aura": she raises a flag when she opens her
  // prompt, and if she did we park the spell's resolution (of any type) behind it — see the branches
  // below + resolvePendingCast. Other cast-trigger prompts keep the old synchronous behavior.
  state.flow.enchantAnimatePending = false
  const promptsBeforeCast = state.prompts.length
  emitEvent(state, 'onSpellCast', player, castName, casterId, targets)
  const enchantDeferred = state.prompts.length > promptsBeforeCast && !!state.flow.enchantAnimatePending
  state.flow.enchantAnimatePending = false

  // fresh capture for the cast reveal shown to BOTH players (golden caster + spell name,
  // plus either a numbered damage grid — Lava Flow / Ice Lance / Earthquake — OR red-glowing
  // affected sites for a single-target spell). Element tints the numbers.
  beginAreaReveal(state, def.elements?.[0]?.toLowerCase(), castName, caster.id, def.type === 'Magic')
  if (def.type === 'Magic') {
    // capture the sites the spell touches NOW (before it moves/kills anything): a targeted
    // unit's/artifact's square, or a targeted site. Area spells target squares/directions,
    // not units, so they leave this empty and show the numbered grid instead.
    const affected: { x: number; y: number }[] = []
    for (const ref of targets) {
      if ('unit' in ref) { const u = state.units[ref.unit]; if (u) affected.push({ x: u.x, y: u.y }) }
      else if ('site' in ref) { const s = state.sites[ref.site]; if (s) affected.push({ x: s.x, y: s.y }) }
      else if ('artifact' in ref) { const a = state.artifacts[ref.artifact]; if (a) affected.push({ x: a.x, y: a.y }) }
      else if ('square' in ref && ref.square) affected.push({ x: ref.square.x, y: ref.square.y })
    }
    if (affected.length) recordAffectedSites(state, affected)
  }

  // Each spell type either resolves inline, or — if the Enchantress opened her animate prompt — parks
  // its resolution in flow.pendingCast for resolvePendingCast to finish once that prompt is answered.
  if (def.type === 'Magic') {
    // A SITE caster (River of Flame…) occupies BOTH its surface and its subsurface, so it must choose WHICH
    // region it casts FROM. We fire this for EVERY magic a site casts — NOT just obviously-positional ones:
    // a missed prompt silently casts from the wrong region (Heat Ray's projectile, any ranged/area spell),
    // and a harmless extra prompt is far better than a wrong silent assumption.
    const siteCaster = state.sites[caster.id]
    if (siteCaster && extra?.castRegion === undefined) {
      const sub = terrainAt(state, siteCaster.x, siteCaster.y) === 'water' ? 'underwater' : 'underground'
      state.flow.pendingCast = { type: 'magic', cardId, castName, player, casterId, at, targets, extra, fromCemetery }
      pushPrompt(state, { player, kind: 'chooseOption', title: `Cast ${castName} from which region?`, data: { options: ['surface', sub] }, cont: 'cast:region', ctx: {} })
      return null
    }
    // An OVERSIZED / Rack-stretched caster occupies several squares → it picks which one it acts FROM.
    // Same principle: fire for every magic it casts so a projectile/blast origin is never silently assumed.
    const realCaster = state.units[caster.id]
    if (realCaster && extra?.castOrigin === undefined) {
      const squares = occupiedSquares(realCaster)
      if (squares.length > 1) {
        state.flow.pendingCast = { type: 'magic', cardId, castName, player, casterId, at, targets, extra, fromCemetery }
        pushPrompt(state, { player, kind: 'chooseSquare', title: `Cast ${castName} from which square?`, data: { squares }, cont: 'cast:origin', ctx: {} })
        return null
      }
    }
    if (enchantDeferred) { state.flow.pendingCast = { type: 'magic', cardId, castName, player, casterId, at, targets, extra, fromCemetery }; return null }
    resolveMagicCast(state, cardId, castName, player, casterId, targets, at, extra, fromCemetery)
    return null
  }

  if (def.type === 'Minion') {
    if (enchantDeferred) { state.flow.pendingCast = { type: 'minion', cardId, castName, player, casterId, at, targets, extra, fromCemetery }; return null }
    summonCastMinion(state, cardId, castName, player, at, targets, extra)
    return null
  }

  if (def.type === 'Artifact') {
    if (enchantDeferred) { state.flow.pendingCast = { type: 'artifact', cardId, castName, player, casterId, at, targets, extra, fromCemetery }; return null }
    resolveArtifactCast(state, cardId, castName, player, at, targets, extra)
    return null
  }

  if (def.type === 'Aura') {
    if (enchantDeferred) { state.flow.pendingCast = { type: 'aura', cardId, castName, player, casterId, at, targets, extra, fromCemetery }; return null }
    resolveAuraCast(state, cardId, castName, player, at, targets, extra)
    return null
  }

  return 'Unsupported card type.'
}

export function validateSummonAt(state: GameState, player: PlayerId, cardName: string, at: { x: number; y: number; region?: Region }): string | null {
  const def = getCard(cardName)
  // spread: summonsGainKeywords mutates kw below, so it must be a private copy
  const kw = { ...getKeywords(def.name) }
  const region = at.region ?? 'surface'
  // oversized: `at` is the 2x2 anchor; every square needs a site, one of them yours
  if (getScript(cardName)?.oversized) {
    if (region !== 'surface') return 'Oversized minions occupy the surface.'
    const wrap = edgesConnected(state) // Magellan Globe: a 2x2 may straddle the edge, wrapping to the far side (FAQ 1)
    if (at.x < 0 || at.x >= GRID_W || at.y < 0 || at.y >= GRID_H) return 'The 2x2 area must fit inside the realm.'
    if (!wrap && (at.x >= GRID_W - 1 || at.y >= GRID_H - 1)) return 'The 2x2 area must fit inside the realm.'
    let ownSite = false
    for (const sq of aura2x2Squares({ x: at.x, y: at.y }, wrap)) {
      const s = siteAt(state, sq.x, sq.y)
      if (!s) return 'Every square of the 2x2 area needs a site.'
      if (s.controller === player) ownSite = true
    }
    if (!ownSite) return 'The area must include a site you control.'
    return null
  }
  const site = siteAt(state, at.x, at.y)
  // global keyword grants visible at summon time (Kingdom of Agartha)
  for (const s2 of Object.values(state.sites)) {
    const g = getScript(s2.name)?.summonsGainKeywords
    if (g && !s2.isRubble && s2.controller !== null && !siteSilenced(state, s2)) {
      for (const k of g(state, s2.id, player)) applyKeywordString(kw, k)
    }
  }
  // A minion "being summoned nearby" gains a site's static keywords the instant it
  // enters (Hellmouth: Evil minions summoned nearby have Burrowing). It doesn't
  // exist yet, so probe with a stand-in at the target square and fold any granted
  // region keywords (burrowing/submerge/voidwalk) into kw — matching what the unit
  // will have on entry, so an underground/underwater/void summon is legal.
  if (region !== 'surface') {
    const probe: UnitState = {
      id: '__summonprobe__', cardId: '', name: cardName, owner: player, controller: player,
      isAvatar: false, x: at.x, y: at.y, region, tapped: false, damage: 0, enteredTurn: state.turn,
      modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
    }
    for (const s2 of Object.values(state.sites)) {
      const g = getScript(s2.name)?.siteGrantsKeywords
      if (g && !s2.isRubble && s2.controller !== null && !siteSilenced(state, s2)) {
        for (const k of g(state, s2, probe)) applyKeywordString(kw, k)
      }
    }
  }
  const mustRegion = getScript(cardName)?.mustSummonRegion
  if (mustRegion && region !== mustRegion) return `${cardName} must be summoned ${mustRegion}.`
  const posFilter = getScript(cardName)?.summonFilter
  if (posFilter) {
    const err = posFilter(state, player, at)
    if (err) return err
  }
  if (region === 'void') {
    // a friendly voidwalker that hosts summons opens its void square (Lucid Dreamers)
    const voidHost = Object.values(state.units).some(
      (u) => u.controller === player && !u.silenced && u.x === at.x && u.y === at.y && u.region === 'void' && getScript(u.name)?.allowsSummonHere,
    )
    if (!kw.voidwalk && !voidHost) return `${cardName} cannot be summoned to the void.`
    if (site) return 'That square is not void.'
    return null
  }
  if (!site) {
    // no site here — but the avatar may grant this square anyway (Harbinger's portents
    // let you cast a minion to a fated square even if it is void ground).
    const av = avatarOf(state, player)
    const grants = getScript(av.name)?.allowsSummonAt
    if (region === 'surface' && grants && !av.silenced && grants(state, player, at)) {
      // a siteless granted square IS void ground: the void-placement rule outranks the grant, so only a
      // voidwalker may be summoned there. A non-voidwalk minion still can't be cast into the void.
      if (!kw.voidwalk) return `${cardName} cannot be summoned to the void.`
      return null
    }
    return 'There is no site there.'
  }
  // absolute ENTRY bans apply to summoning too, not just movement (Gnome Hollows: "units with 3 or
  // more power can't enter this site"). Treat the summon like a forced entry so only entry filters
  // that block forced entry (an absolute ban) apply, mirroring the move path.
  {
    const entryProbe = {
      id: '__summonentryprobe__', cardId: '', name: cardName, owner: player, controller: player,
      isAvatar: false, x: at.x, y: at.y, region, tapped: false, damage: 0, enteredTurn: state.turn,
      modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
    } as UnitState
    if (!siteEntryAllowed(state, entryProbe, { x: -1, y: -1, region: 'offboard' as Region }, { x: at.x, y: at.y, region }, true)) {
      return `${cardName} can't be summoned there.`
    }
  }
  // site-level summon bans (No Man's Land)
  for (const s of Object.values(state.sites)) {
    const block = getScript(s.name)?.blockSummon
    if (block && !siteSilenced(state, s) && block(state, s, at)) return `${s.name} forbids summoning there.`
  }
  const summonAnywhere = getScript(cardName)?.summonAnywhere
  // a friendly unit that opens its square to summons (Ominous Owl)
  const hostHere = Object.values(state.units).some(
    (u) => u.controller === player && !u.silenced && u.x === at.x && u.y === at.y && getScript(u.name)?.allowsSummonHere,
  )
  // a site open to everyone's minions (Donnybrook Inn, Tournament Grounds)
  const anySummon = getScript(site.name)?.siteAllowsAnySummon
  const openHouse =
    !siteSilenced(state, site) &&
    (anySummon === true || (typeof anySummon === 'function' && anySummon(state, site, player, cardName)))
  // avatar-granted summon squares (Harbinger's three portents)
  const avatarSpot = (() => {
    const av = avatarOf(state, player)
    const f = getScript(av.name)?.allowsSummonAt
    return !!f && !av.silenced && f(state, player, at)
  })()
  // aura-granted summon squares (Summoning Sphere, Crusade, Jihad, Evil Presence)
  const auraSpot = Object.values(state.auras).some((r) => {
    const f = getScript(r.name)?.auraAllowsSummon
    return f && f(state, r, player, cardName, at)
  })
  // one-turn open-summon windows (Spore Spouts: minions with ≤N power to any site)
  const windowOpen = (state.flow?.summonWindows ?? []).some(
    (w: any) => w.player === player && w.turn === state.turn && (getCard(cardName).attack ?? 0) <= w.maxPower,
  )
  if (site.controller !== player && !summonAnywhere && !hostHere && !openHouse && !avatarSpot && !auraSpot && !windowOpen)
    return 'Minions are summoned atop your own sites.'
  // cards FORCED into a region are summoned there "safely" (Awakened Mummies)
  const forcedRegion = getScript(cardName)?.mustSummonRegion
  if (region === 'underground' && !kw.burrowing && forcedRegion !== 'underground') return `${cardName} cannot be summoned underground.`
  if (region === 'underwater' && !kw.submerge && forcedRegion !== 'underwater') return `${cardName} cannot be summoned underwater.`
  if (region === 'underground' || region === 'underwater') {
    const water = getCard(site.name).thresholds.water > 0 || site.flooded
    if (region === 'underground' && water) return 'That is a water site — no underground there.'
    if (region === 'underwater' && !water) return 'That is a land site — no underwater there.'
  }
  return null
}

// ============================================================================
// Effect-driven casting.  "Cast a spell" effects (Chaoswish; the collection
// casts — Silver Bullet / Toolbox / Malleus) must CAST the spell for real:
// resolve it through castSpell, prompting for the spell's OWN target / square /
// direction — never leave a token sitting in the player's hand.  A completion
// hook (`afterKey`, a registered cont) fires when the cast resolves OR fizzles,
// so Chaoswish can pass the copy to the next player as a proper out-of-turn
// optional action instead of dumping a card that can't be cast into their hand.
// ============================================================================

interface PendingCast { player: PlayerId; casterId: string; targets: string[]; afterKey?: string; afterCtx?: unknown; ctOrigin?: { x: number; y: number }; forcedAt?: { x: number; y: number; region?: Region }; realCard?: boolean; isCopy?: boolean; summonAt?: { x: number; y: number; region?: Region } }

function pcMap(state: GameState): Record<string, PendingCast> {
  state.flow = state.flow ?? {}
  return (state.flow.pendingCasts ??= {})
}

/** the caster the engine will cast with: the avatar if it may, else any
 *  controlled unit that may (caster-expansion spells like Burning Hands). */
function pickEffectCaster(state: GameState, player: PlayerId, cardId: string): string | null {
  const av = avatarOf(state, player)
  if (canCast(state, player, cardId, av.id).ok) return av.id
  for (const u of Object.values(state.units)) {
    if (u.controller === player && !u.isAvatar && canCast(state, player, cardId, u.id).ok) return u.id
  }
  return null
}

/** Your spellcasters that could cast `cardName` right now (avatar first), judged only by the
 *  Spellcaster + element-lock rules — NOT mana/threshold (player-wide) nor whether a target is in
 *  range (resolved at cast time). Used by Archimago's echo: the FAQ says ANY of your spellcasters may
 *  cast the copied spell, so the player picks which one (a projectile fires from the chosen caster). */
export function casterCandidatesFor(state: GameState, player: PlayerId, cardName: string): string[] {
  const def = getCard(cardName)
  const out: string[] = [avatarOf(state, player).id]
  for (const u of Object.values(state.units)) {
    if (u.controller !== player || u.isAvatar || isDisabled(state, u)) continue
    const kw = effKeywords(state, u)
    if (kw.spellcaster && normalCasterCheck(u, kw, def) === null) out.push(u.id)
  }
  return out
}

function removeCastToken(state: GameState, cardId: string): void {
  for (const p of state.players) {
    for (const zone of [p.hand, p.cemetery, p.banished]) {
      const i = zone.indexOf(cardId)
      if (i >= 0) zone.splice(i, 1)
    }
  }
  delete state.cards[cardId]
  if (state.flow?.freeCast) state.flow.freeCast = state.flow.freeCast.filter((id: string) => id !== cardId)
  if (state.flow?.noThresholdCards) state.flow.noThresholdCards = state.flow.noThresholdCards.filter((id: string) => id !== cardId)
}

function fireAfter(state: GameState, pc: PendingCast | undefined): void {
  if (pc?.afterKey) runCont(state, pc.afterKey, pc.afterCtx, null)
}

/** Cast `cardName` as a free, threshold-ignoring EFFECT (a fresh token copy).
 *  Drives the spell's own cast prompts and resolves via castSpell; fires
 *  opts.afterKey when the cast resolves or fizzles. */
export function effectCastSpell(
  state: GameState,
  player: PlayerId,
  cardName: string,
  opts?: {
    afterKey?: string; afterCtx?: unknown
    /** free + threshold-ignoring (Chaoswish copy). Default true. Collection casts
     *  (Silver Bullet / Toolbox / Malleus) pass free:false — they pay the cost. */
    free?: boolean
    /** force this unit as the caster (a bearer) instead of avatar-first. */
    caster?: string
    /** grant the forced caster the ability to cast it even if not a Spellcaster
     *  ("this unit may cast X from your collection"). */
    grantsCasting?: boolean
    /** tag the token id into this flow list (e.g. 'malleusCast' target constraint). */
    tag?: string
    /** force a placement/summon square instead of prompting (e.g. Troubled Town
     *  "cast a Townsfolk … to this site"). Applies to Minion/Artifact/Aura casts. */
    at?: { x: number; y: number; region?: Region }
  },
): void {
  const def = getCard(cardName)
  if (def.type === 'Site' || def.type === 'Avatar' || cardSupport(def) === 'unsupported') {
    fireAfter(state, { player, casterId: '', targets: [], ...opts })
    return
  }
  const free = opts?.free !== false
  // A REAL cast-from-collection/spellbook (Silver Bullet, Toolbox, the Malleus, Troubled Town, Doomsday
  // Cult…) pays the card's cost and puts a REAL card into play — a Minion/Artifact/Aura that dies, AND a
  // Magic that resolves, must go to the CEMETERY, not vanish. Only a FREE copy (Chaoswish) is a token
  // that vanishes. So: token iff free. This routes a slain collection-cast permanent AND a resolved
  // collection-cast Magic to the cemetery (toCemetery bails on isToken) — the fix for the whole family.
  const asToken = free
  const cardId = `c${state.nextId++}`
  state.cards[cardId] = { id: cardId, name: cardName, owner: player, isToken: asToken } as any
  state.players[player].hand.push(cardId)
  state.flow = state.flow ?? {}
  if (free) {
    state.flow.freeCast = [...(state.flow.freeCast ?? []), cardId]
    state.flow.noThresholdCards = [...(state.flow.noThresholdCards ?? []), cardId]
  }
  // a forced caster may cast this even if it isn't a Spellcaster (granted ability)
  if (opts?.caster && opts.grantsCasting) {
    state.flow.lockedCards = [...(state.flow.lockedCards ?? []), { cardId, casterId: opts.caster, casterName: state.units[opts.caster]?.name ?? state.artifacts[opts.caster]?.name, grantsCasting: true }]
  }
  if (opts?.tag) state.flow[opts.tag] = [...(state.flow[opts.tag] ?? []), cardId]
  // A FREE Magic COPY must never end up in the cemetery (FAQ: a copy is a token) — route it to banished,
  // then delete it once resolved. A PAID collection-cast Magic is the real card: it goes to the cemetery
  // via castSpell like any hand cast, so it is NOT banished here.
  if (def.type === 'Magic' && free) state.flow.banishAfterCast = [...(state.flow.banishAfterCast ?? []), cardId]
  // safety net: an uncast token vanishes at end of turn (never lingers in hand)
  state.flow.lends = [...(state.flow.lends ?? []), { cardId, holder: player, returnTo: 'vanish', owner: player }]
  const caster = opts?.caster && canCast(state, player, cardId, opts.caster).ok ? opts.caster : pickEffectCaster(state, player, cardId)
  // a FREE effect-cast is a token COPY (Chaoswish) → labelled "Copy of X"; a PAID collection cast
  // (Silver Bullet, Toolbox, Malleus, Troubled Town…) is the REAL spell, not a copy → labelled by name.
  const pc: PendingCast = { player, casterId: caster ?? state.players[player].avatarUnitId, targets: [], afterKey: opts?.afterKey, afterCtx: opts?.afterCtx, forcedAt: opts?.at, isCopy: free }
  if (caster === null) {
    pushLog(state, player, `${cardName} can't be cast right now — it fizzles.`)
    removeCastToken(state, cardId)
    fireAfter(state, pc)
    return
  }
  pcMap(state)[cardId] = pc
  advanceEffectCast(state, cardId)
}

/** Cast an EXISTING card already in `player`'s hand as an effect, driving its own cast prompts (target
 *  selection, placement) immediately — the same engine-driven flow as effectCastSpell, but on the real
 *  hand card, not a token copy (so it isn't duplicated). "You may cast a spell for free" (The Apex of
 *  Babel): choosing the spell casts it right then. `free` (default true) makes it cost 0 and ignore
 *  thresholds. Does nothing (leaves the card in hand) if it can't currently be cast. */
export function effectCastHandCard(
  state: GameState,
  player: PlayerId,
  cardId: string,
  opts?: { free?: boolean; afterKey?: string; afterCtx?: unknown },
): void {
  const card = state.cards[cardId]
  if (!card || !state.players[player].hand.includes(cardId)) return
  const def = getCard(card.name)
  if (def.type === 'Site' || def.type === 'Avatar' || cardSupport(def) === 'unsupported') {
    fireAfter(state, { player, casterId: '', targets: [], afterKey: opts?.afterKey, afterCtx: opts?.afterCtx })
    return
  }
  const free = opts?.free !== false
  state.flow = state.flow ?? {}
  if (free) {
    state.flow.freeCast = [...(state.flow.freeCast ?? []), cardId]
    state.flow.noThresholdCards = [...(state.flow.noThresholdCards ?? []), cardId]
  }
  const caster = pickEffectCaster(state, player, cardId)
  const pc: PendingCast = { player, casterId: caster ?? state.players[player].avatarUnitId, targets: [], afterKey: opts?.afterKey, afterCtx: opts?.afterCtx, realCard: true }
  if (caster === null) {
    // can't be cast right now — don't consume the free credit, leave the card in hand
    if (free) {
      state.flow.freeCast = (state.flow.freeCast ?? []).filter((id: string) => id !== cardId)
      state.flow.noThresholdCards = (state.flow.noThresholdCards ?? []).filter((id: string) => id !== cardId)
    }
    pushLog(state, player, `${card.name} can't be cast right now.`)
    fireAfter(state, pc)
    return
  }
  pcMap(state)[cardId] = pc
  advanceEffectCast(state, cardId)
}

/**
 * "Cast a named card from your collection to <at>" — the shared path for sites
 * like Troubled Town / Molten Maar / Forlorn Keep / Forsaken Crypt / Peculiar Port
 * and Elder Ruins. Per the rulebook the copy LEAVES the collection and is CAST for
 * real (paying its mana cost) — NOT free-summoned (that verb is "Summon …", handled
 * separately). Enforces, in order: not banished (Legion of Gall), owned, affordable
 * ("you MAY cast"), and the (2) collection-access toll (Bureau of Occult Control,
 * which tolls any card leaving the collection). Then consumes the copy and casts it
 * with placement forced to `at`. No-op (with a log where useful) if any gate fails.
 * Returns true iff the cast was initiated.
 */
export function castFromCollection(state: GameState, player: PlayerId, name: string, at: { x: number; y: number; region?: Region }): boolean {
  const p = state.players[player]
  if (collectionBanned(state, player, name)) {
    pushLog(state, player, `Every ${name} in the collection was banished by the Legion of Gall.`)
    return false
  }
  if ((p.collection[name] ?? 0) <= 0) return false // must own a copy
  if (!affordable(state, player, name, avatarOf(state, player))) return false // "may cast" only if payable
  if (!payZoneToll(state, player)) {
    pushLog(state, player, 'The Bureau of Occult Control demands (2) for collection access.')
    return false
  }
  takeFromCollection(state, player, name)
  effectCastSpell(state, player, name, { free: false, at })
  return true
}

function finishEffectCast(state: GameState, cardId: string, at?: { x: number; y: number; region?: Region }, targets?: string[], extra?: unknown): void {
  const map = pcMap(state); const pc = map[cardId]; if (!pc) return
  delete map[cardId]
  const name = state.cards[cardId]?.name ?? 'the spell'
  const wasMagic = getCard(state.cards[cardId]?.name ?? '').type === 'Magic'
  const err = castSpell(state, pc.player, cardId, pc.casterId, at, targets, extra as any)
  if (err) {
    // a REAL hand card that fails to cast stays in hand (only drop the one-shot free credit); a token copy vanishes
    if (pc.realCard) { dropCastCredit(state, cardId); pushLog(state, pc.player, `${name} can't be cast — ${err}`) }
    else { pushLog(state, pc.player, pc.isCopy ? `The copy fizzles — ${err}` : `${name} can't be cast — ${err}`); removeCastToken(state, cardId) }
  } else if (wasMagic && pc.isCopy) {
    // resolved: only a FREE Magic COPY is a token — it vanishes, never to the cemetery. A PAID
    // collection-cast Magic (Silver Bullet / Toolbox / Malleus) is the real card and castSpell already
    // sent it to the cemetery, so it is left alone here.
    removeCastToken(state, cardId)
  }
  fireAfter(state, pc)
}

function fizzleEffectCast(state: GameState, cardId: string): void {
  const map = pcMap(state); const pc = map[cardId]
  delete map[cardId]
  const name = state.cards[cardId]?.name ?? 'the spell'
  if (pc?.realCard) {
    // can't be cast — leave the real card in hand, just forfeit the free casting
    dropCastCredit(state, cardId)
    pushLog(state, pc?.player ?? 0, `${name} can't be cast — the free casting is passed up.`)
  } else {
    removeCastToken(state, cardId)
    pushLog(state, pc?.player ?? 0, pc?.isCopy ? `The copy of ${name} can't be cast — it fizzles.` : `${name} can't be cast — it fizzles.`)
  }
  fireAfter(state, pc)
}

/** forfeit a one-shot free-cast/no-threshold credit without removing the card (it stays in hand) */
function dropCastCredit(state: GameState, cardId: string): void {
  if (state.flow?.freeCast) state.flow.freeCast = state.flow.freeCast.filter((id: string) => id !== cardId)
  if (state.flow?.noThresholdCards) state.flow.noThresholdCards = state.flow.noThresholdCards.filter((id: string) => id !== cardId)
}

/** legal target refs for one spec (engine-side mirror of the client's picker). */
function effectSpecCandidates(state: GameState, player: PlayerId, caster: UnitState, spec: TargetSpec): string[] {
  const out: string[] = []
  if (spec.what === 'site') {
    for (const s of Object.values(state.sites)) if (!s.isRubble && !validateTarget(state, spec, { site: s.id }, caster, player)) out.push(s.id)
  } else {
    // minion/unit/avatar/artifact/minionOrArtifact: try units (Automatons pass an 'artifact' spec),
    // and also artifacts for 'artifact'/'minionOrArtifact'. validateTarget rejects the wrong type.
    for (const u of Object.values(state.units)) if (!validateTarget(state, spec, { unit: u.id }, caster, player)) out.push(u.id)
    if (spec.what === 'artifact' || spec.what === 'minionOrArtifact')
      for (const a of Object.values(state.artifacts)) if (!validateTarget(state, spec, { artifact: a.id }, caster, player)) out.push(a.id)
  }
  return out
}

/** Legal placements for conjuring artifact `castName` as `player` — EXACTLY the set castSpell's
 *  artifact branch accepts, returned as target ids: units you may hand it to (giveTo) and sites you
 *  may conjure it onto. Shared so an effect-cast (Silver Bullet, Toolbox, Malleus, Chaoswish copy…)
 *  offers the SAME locations and board visuals as a normal conjure — including handing it to your
 *  Avatar while it stands on an opponent's site (a giveTo unit, not a your-site square). */
export function artifactCastPlacements(state: GameState, player: PlayerId, castName: string): { giveTo: string[]; conjure: string[] } {
  const enemyOk = !!getScript(castName)?.conjureToEnemy
  const giveTo = Object.values(state.units).filter((u) => enemyOk || u.controller === player).map((u) => u.id)
  const filter = getScript(castName)?.conjureFilter
  const conjure: string[] = []
  for (const s of Object.values(state.sites)) {
    if (s.isRubble) continue
    // your own sites, plus any site that lets anyone conjure here (Dwarven Forge)
    const forge = !siteSilenced(state, s) && (() => {
      const f = getScript(s.name)?.siteAllowsAnyConjure
      return f === true || (typeof f === 'function' && f(state, castName))
    })()
    if (s.controller !== player && !forge) continue
    if (filter && filter(state, player, { x: s.x, y: s.y }) !== null) continue
    conjure.push(s.id)
  }
  return { giveTo, conjure }
}

/** resolve a chosen artifact placement id: a site id → conjure there; a unit id → hand it over (giveTo). */
function resolveEffectArtifactPlacement(state: GameState, cardId: string, id: string): void {
  const site = state.sites[id]
  if (site) return finishEffectCast(state, cardId, { x: site.x, y: site.y, region: 'surface' }, [])
  finishEffectCast(state, cardId, undefined, [], { giveTo: id })
}

function advanceEffectCast(state: GameState, cardId: string): void {
  const pc = pcMap(state)[cardId]; if (!pc) return
  const card = state.cards[cardId]; if (!card) { fizzleEffectCast(state, cardId); return }
  const name = card.name, def = getCard(name), script = getScript(name)
  // Only a genuine token COPY (a free Chaoswish-style cast) is prefixed "Copy of". A real hand card
  // (effectCastHandCard) and a PAID collection cast (Silver Bullet/Toolbox/Malleus…) use the plain name.
  const label = pc.isCopy && !pc.realCard ? `Copy of ${name}` : name
  const caster = state.units[pc.casterId] ?? avatarOf(state, pc.player)

  // forced placement (Troubled Town "cast … to this site"): skip the square
  // prompt and cast straight onto the dictated square — genesis/targets are still
  // resolved by castSpell. Magic has no placement square, so it's unaffected.
  if (pc.forcedAt && def.type !== 'Magic') return finishEffectCast(state, cardId, pc.forcedAt, [])

  if (def.type === 'Minion') {
    const spots: { x: number; y: number }[] = []
    for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++)
      if ((['surface', 'underground', 'underwater', 'void'] as Region[]).some((r) => validateSummonAt(state, pc.player, name, { x, y, region: r }) === null)) spots.push({ x, y })
    if (!spots.length) return fizzleEffectCast(state, cardId)
    // an oversized (2x2) minion is placed by intersection markers, exactly like a normal summon
    const area2x2 = !!script?.oversized
    pushPrompt(state, { player: pc.player, kind: 'chooseSquare', title: `${label} — summon where?`, data: { squares: spots, ...(area2x2 ? { area2x2: true } : {}) }, cont: 'effectcast:summon', ctx: { cardId } })
    return
  }
  if (def.type === 'Artifact') {
    // SAME placements a normal conjure offers: hand it to a unit (giveTo) OR conjure onto a site.
    // A mixed unit+site chooseTargets ('Bless-style' — the client highlights unit chips AND rings
    // legal sites, clicking either answers), so you can e.g. give it to your Avatar on an enemy site.
    const { giveTo, conjure } = artifactCastPlacements(state, pc.player, name)
    const candidates = [...giveTo, ...conjure]
    if (!candidates.length) return fizzleEffectCast(state, cardId)
    if (candidates.length === 1) return resolveEffectArtifactPlacement(state, cardId, candidates[0])
    pushPrompt(state, { player: pc.player, kind: 'chooseTargets', title: `${label} — give to a unit or conjure on a site`, data: { candidates, count: 1, kind: 'unit' }, cont: 'effectcast:artifact', ctx: { cardId } })
    return
  }
  if (def.type === 'Aura') {
    const placement = script?.auraPlacement
    // auraPlacement is anchored on the CASTER (a normal cast passes it — "nearby the caster"),
    // so a placement is legal iff placement(state, player, at, caster) === null.
    const ok = (at: { x: number; y: number }) => { try { return !placement || placement(state, pc.player, at, caster) === null } catch { return false } }
    const single = !!script?.singleSiteAura
    const wall = !!(script as { edgeAura?: boolean } | undefined)?.edgeAura
    if (single || wall) {
      // a single-site aura lands on ONE site; a wall lands on a site, then its Genesis picks the
      // border. Offer the valid SITE squares (a plain highlight, exactly like the normal cast).
      const spots = Object.values(state.sites).filter((s) => !s.isRubble && ok({ x: s.x, y: s.y })).map((s) => ({ x: s.x, y: s.y }))
      if (!spots.length) return fizzleEffectCast(state, cardId)
      pushPrompt(state, { player: pc.player, kind: 'chooseSquare', title: `${label} — place on which site?`, data: { squares: spots }, cont: 'effectcast:place', ctx: { cardId } })
      return
    }
    // a plain 2x2 aura is placed by INTERSECTION markers (area2x2) at its valid top-left anchors —
    // the same visuals and locations a normal cast offers (the 2x2 must fit, or wrap with the Globe).
    const wrap = edgesConnected(state)
    const maxX = wrap ? GRID_W : GRID_W - 1
    const maxY = wrap ? GRID_H : GRID_H - 1
    const spots: { x: number; y: number }[] = []
    for (let x = 0; x < maxX; x++) for (let y = 0; y < maxY; y++) if (ok({ x, y })) spots.push({ x, y })
    if (!spots.length) return fizzleEffectCast(state, cardId)
    pushPrompt(state, { player: pc.player, kind: 'chooseSquare', title: `${label} — choose the two-by-two area`, data: { squares: spots, area2x2: true }, cont: 'effectcast:place', ctx: { cardId } })
    return
  }
  // Magic
  if (name === 'Chaos Twister') return advanceChaosTwister(state, cardId)
  if (script?.shootsProjectile) {
    pushPrompt(state, { player: pc.player, kind: 'chooseOption', title: `${label} — which direction?`, data: { options: ['n', 's', 'e', 'w'] }, cont: 'effectcast:dir', ctx: { cardId } })
    return
  }
  const specs = script?.targets ?? []
  const total = specs.reduce((a, s) => a + s.count, 0)
  if (total === 0) return finishEffectCast(state, cardId, undefined, [])
  // which spec is next? (count picks accumulated so far)
  let idx = 0, acc = 0
  for (; idx < specs.length; idx++) { if (pc.targets.length < acc + specs[idx].count) break; acc += specs[idx].count }
  if (idx >= specs.length) return finishEffectCast(state, cardId, undefined, pc.targets)
  const spec = specs[idx]
  if (spec.what === 'square') {
    const spots: { x: number; y: number }[] = []
    for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++)
      if (!validateTarget(state, spec, { square: { x, y, region: caster.region } }, caster, pc.player)) spots.push({ x, y })
    if (!spots.length) return spec.upTo ? finishEffectCast(state, cardId, undefined, pc.targets) : fizzleEffectCast(state, cardId)
    pushPrompt(state, { player: pc.player, kind: 'chooseSquare', title: `${label} — ${spec.label ?? 'target location'}`, data: { squares: spots }, cont: 'effectcast:sqtarget', ctx: { cardId } })
    return
  }
  const cands = effectSpecCandidates(state, pc.player, caster, spec)
  if (!cands.length) return spec.upTo ? finishEffectCast(state, cardId, undefined, pc.targets) : fizzleEffectCast(state, cardId)
  pushPrompt(state, {
    player: pc.player, kind: 'chooseTargets',
    title: `${label} — ${spec.label ?? 'choose a target'}`,
    data: { candidates: cands, count: 1, kind: spec.what === 'site' ? 'site' : 'unit', upTo: !!spec.upTo },
    cont: 'effectcast:target', ctx: { cardId },
  })
}

const isSquare = (c: unknown): c is { x: number; y: number } =>
  !!c && typeof (c as any).x === 'number' && typeof (c as any).y === 'number'

// Chaos Twister via effect-cast: its onCast wants targets:[minion] + extra:{origin,
// direction}. The normal cast collects these with a bespoke cone-preview UI; here
// we gather the same inputs with standard prompts (minion → origin → direction).
function advanceChaosTwister(state: GameState, cardId: string): void {
  const pc = pcMap(state)[cardId]; if (!pc) return
  const caster = state.units[pc.casterId] ?? avatarOf(state, pc.player)
  const label = pc.isCopy && !pc.realCard ? 'Copy of Chaos Twister' : 'Chaos Twister'
  if (pc.targets.length === 0) {
    const spec = getScript('Chaos Twister')?.targets?.[0]
    const cands = spec ? effectSpecCandidates(state, pc.player, caster, spec) : []
    if (!cands.length) return fizzleEffectCast(state, cardId)
    pushPrompt(state, { player: pc.player, kind: 'chooseTargets', title: `${label} — which minion?`, data: { candidates: cands, count: 1, kind: 'unit' }, cont: 'effectcast:target', ctx: { cardId } })
    return
  }
  if (!pc.ctOrigin) {
    const spots: { x: number; y: number }[] = []
    for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) spots.push({ x, y })
    pushPrompt(state, { player: pc.player, kind: 'chooseSquare', title: `${label} — blow FROM which square?`, data: { squares: spots }, cont: 'effectcast:ctorigin', ctx: { cardId } })
    return
  }
  pushPrompt(state, { player: pc.player, kind: 'chooseOption', title: `${label} — blow which way?`, data: { options: ['n', 's', 'e', 'w'] }, cont: 'effectcast:ctdir', ctx: { cardId } })
}

registerCont('effectcast:summon', (state, ctx: { cardId: string }, choice) => {
  const pc = pcMap(state)[ctx.cardId]; if (!pc) return
  if (!isSquare(choice)) return fizzleEffectCast(state, ctx.cardId)
  const name = state.cards[ctx.cardId]?.name ?? ''
  // when the square admits more than one layer (surface / underground / underwater / void), let the
  // player choose which — exactly like a normal summon's region prompt — instead of auto-picking.
  const regions = (['surface', 'underground', 'underwater', 'void'] as Region[]).filter((r) => validateSummonAt(state, pc.player, name, { x: choice.x, y: choice.y, region: r }) === null)
  if (!regions.length) return fizzleEffectCast(state, ctx.cardId)
  if (regions.length > 1) {
    pc.summonAt = { x: choice.x, y: choice.y }
    pushPrompt(state, { player: pc.player, kind: 'chooseOption', title: `Summon ${name} to which layer?`, data: { options: regions }, cont: 'effectcast:summonregion', ctx: { cardId: ctx.cardId } })
    return
  }
  const region = regions[0]
  // Remember WHERE it lands, then collect its Genesis's targets (measured from that square) before
  // finishing — an effect-cast minion (Toolbox/Silver Bullet/Malleus/Chaoswish copy…) must still get
  // to pick its Genesis target (Vile Imp's "deal 2 to an adjacent unit"), exactly like a normal cast.
  pc.summonAt = { x: choice.x, y: choice.y, region }
  advanceMinionGenesisTargets(state, ctx.cardId)
})
registerCont('effectcast:summonregion', (state, ctx: { cardId: string }, choice) => {
  const pc = pcMap(state)[ctx.cardId]; if (!pc || !pc.summonAt) return fizzleEffectCast(state, ctx.cardId)
  const region = (typeof choice === 'string' ? choice : 'surface') as Region
  pc.summonAt = { x: pc.summonAt.x, y: pc.summonAt.y, region }
  advanceMinionGenesisTargets(state, ctx.cardId)
})

/** Effect-cast minion: after the summon square is chosen, gather its Genesis's `genesisTargets` (the
 *  same specs a normal cast collects), anchored at the LANDING square, then finish the cast. */
function advanceMinionGenesisTargets(state: GameState, cardId: string): void {
  const pc = pcMap(state)[cardId]; if (!pc) return
  const at = pc.summonAt
  const name = state.cards[cardId]?.name ?? ''
  const specs = getScript(name)?.genesisTargets ?? []
  if (!at || specs.length === 0) return finishEffectCast(state, cardId, at, pc.targets)
  // which spec is next? (picks accumulated so far)
  let idx = 0, acc = 0
  for (; idx < specs.length; idx++) { if (pc.targets.length < acc + specs[idx].count) break; acc += specs[idx].count }
  if (idx >= specs.length) return finishEffectCast(state, cardId, at, pc.targets)
  const spec = specs[idx]
  const caster = state.units[pc.casterId] ?? avatarOf(state, pc.player)
  // Genesis targets are relative to the minion, so anchor a pseudo-caster at the landing square.
  const anchor: UnitState = { ...caster, x: at.x, y: at.y, region: at.region ?? caster.region }
  if (spec.what === 'square') {
    const spots: { x: number; y: number }[] = []
    for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++)
      if (!validateTarget(state, spec, { square: { x, y, region: anchor.region } }, anchor, pc.player)) spots.push({ x, y })
    if (!spots.length) return finishEffectCast(state, cardId, at, pc.targets) // no valid spot → summon, Genesis just fizzles
    pushPrompt(state, { player: pc.player, kind: 'chooseSquare', title: `${name} — ${spec.label ?? 'target location'}`, data: { squares: spots }, cont: 'effectcast:gsqtarget', ctx: { cardId } })
    return
  }
  const cands = effectSpecCandidates(state, pc.player, anchor, spec)
  if (!cands.length) return finishEffectCast(state, cardId, at, pc.targets) // no valid target → summon anyway
  pushPrompt(state, {
    player: pc.player, kind: 'chooseTargets',
    title: `${name} — ${spec.label ?? 'choose a target'}`,
    data: { candidates: cands, count: 1, kind: spec.what === 'site' ? 'site' : 'unit', upTo: !!spec.upTo },
    cont: 'effectcast:gtarget', ctx: { cardId },
  })
}
registerCont('effectcast:gtarget', (state, ctx: { cardId: string }, choice) => {
  const pc = pcMap(state)[ctx.cardId]; if (!pc) return
  const picked = Array.isArray(choice) ? choice : choice != null ? [choice] : []
  if (!picked.length) return finishEffectCast(state, ctx.cardId, pc.summonAt, pc.targets) // skipped an optional Genesis target
  for (const id of picked) if (typeof id === 'string') pc.targets.push(id)
  advanceMinionGenesisTargets(state, ctx.cardId)
})
registerCont('effectcast:gsqtarget', (state, ctx: { cardId: string }, choice) => {
  const pc = pcMap(state)[ctx.cardId]; if (!pc) return
  if (isSquare(choice)) pc.targets.push(`sq:${choice.x},${choice.y},${pc.summonAt?.region ?? 'surface'}`)
  advanceMinionGenesisTargets(state, ctx.cardId)
})
registerCont('effectcast:place', (state, ctx: { cardId: string }, choice) => {
  if (!isSquare(choice)) return fizzleEffectCast(state, ctx.cardId)
  finishEffectCast(state, ctx.cardId, { x: choice.x, y: choice.y, region: 'surface' }, [])
})
registerCont('effectcast:artifact', (state, ctx: { cardId: string }, choice) => {
  const pc = pcMap(state)[ctx.cardId]; if (!pc) return
  const id = Array.isArray(choice) ? choice[0] : choice
  if (typeof id !== 'string') return fizzleEffectCast(state, ctx.cardId)
  resolveEffectArtifactPlacement(state, ctx.cardId, id)
})
registerCont('effectcast:dir', (state, ctx: { cardId: string }, choice) => {
  if (!['n', 's', 'e', 'w'].includes(choice as string)) return fizzleEffectCast(state, ctx.cardId)
  finishEffectCast(state, ctx.cardId, undefined, [], { direction: choice })
})
registerCont('effectcast:sqtarget', (state, ctx: { cardId: string }, choice) => {
  const pc = pcMap(state)[ctx.cardId]; if (!pc) return
  if (!isSquare(choice)) return fizzleEffectCast(state, ctx.cardId)
  const caster = state.units[pc.casterId] ?? avatarOf(state, pc.player)
  pc.targets.push(`sq:${choice.x},${choice.y},${caster.region}`)
  advanceEffectCast(state, ctx.cardId)
})
registerCont('effectcast:ctorigin', (state, ctx: { cardId: string }, choice) => {
  const pc = pcMap(state)[ctx.cardId]; if (!pc) return
  if (!isSquare(choice)) return fizzleEffectCast(state, ctx.cardId)
  pc.ctOrigin = { x: choice.x, y: choice.y }
  advanceEffectCast(state, ctx.cardId)
})
registerCont('effectcast:ctdir', (state, ctx: { cardId: string }, choice) => {
  const pc = pcMap(state)[ctx.cardId]; if (!pc) return
  if (!['n', 's', 'e', 'w'].includes(choice as string)) return fizzleEffectCast(state, ctx.cardId)
  finishEffectCast(state, ctx.cardId, undefined, pc.targets, { origin: pc.ctOrigin, direction: choice })
})
registerCont('effectcast:target', (state, ctx: { cardId: string }, choice) => {
  const pc = pcMap(state)[ctx.cardId]; if (!pc) return
  const picked = Array.isArray(choice) ? choice : choice != null ? [choice] : []
  if (!picked.length) { finishEffectCast(state, ctx.cardId, undefined, pc.targets); return } // skipped optional
  for (const id of picked) if (typeof id === 'string') pc.targets.push(id)
  advanceEffectCast(state, ctx.cardId)
})
