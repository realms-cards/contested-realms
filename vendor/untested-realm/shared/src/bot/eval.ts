// ─────────────────────────────────────────────────────────────────────────────
// TURN-STATE EVALUATION  —  evaluate(state, me) → number  (higher = better for me)
//
// A pure, deterministic heuristic over a CONCRETE visible position. It judges the
// board as it stands; it does NOT search (that's the planner's job) and it never
// peeks at hidden information — only the opponent's public counts (hand size, sites,
// board units). Every term is a weight from eval.weights.ts × a cheap board feature,
// grouped so `explainEval` can show exactly where the number comes from.
//
// Speed matters: this is called thousands of times inside the search, so it uses
// cheap reads and a stepDistance-based threat approximation rather than full
// pathfinding (the search itself resolves exact reachability by applying moves).
// ─────────────────────────────────────────────────────────────────────────────
import type { GameState, PlayerId, UnitState } from '../engine/types'
import { avatarOf, siteAt } from '../engine/grid'
import { opponent } from '../engine/effects'
import { effAttack, effDefence, effKeywords, siteSilenced, siteDisabledByArtifact, cemeteryActivations, isBlanked } from '../engine/statics'
import { affinity } from '../engine/casting'
import { stepDistance } from '../engine/movement'
import { getCard } from '../cards/db'
import { getScript } from '../cards/scripts/registry'
import { DEFAULT_WEIGHTS, type EvalWeights } from './eval.weights'

const ELEMENTS = ['air', 'earth', 'fire', 'water'] as const

/** non-avatar units a player controls that are actually on the board (not carried). */
function boardUnits(state: GameState, player: PlayerId): UnitState[] {
  return Object.values(state.units).filter((u) => u.controller === player && !u.isAvatar && !u.carriedBy)
}

/** true if this minion has a real ability/trigger (so a low-stat "support" body still has worth). */
function hasSupportAbility(name: string): boolean {
  const s = getScript(name) as any
  if (!s) return false
  return !!(s.abilities?.length || s.genesis || s.deathrite || s.onCast || s.cemeteryAbilities || s.grantsAbilities ||
    s.grantsPower || s.grantsKeywords || s.onSitePlayed || s.onAnyDeath || s.startOfTurn || s.endOfTurn || s.onWouldDie)
}

/** how far a unit can strike this turn (approx): move range + ranged reach. Immobile can't move
 *  (only strikes adjacent, or shoots if Ranged). Manhattan distance, Magellan-agnostic — good
 *  enough for a static threat estimate; the search confirms real reachability. */
function attackReach(state: GameState, u: UnitState): number {
  const kw = effKeywords(state, u)
  if (kw.immobile) return kw.ranged ?? 1
  return 1 + (kw.movement ?? 0) + (kw.ranged ?? 0)
}

/** Manhattan distance from `player`'s NEAREST board unit to `point` (a big constant if they have
 *  none) — the pull toward (or push from) a death's-door avatar. */
function nearestUnitDistance(state: GameState, player: PlayerId, point: { x: number; y: number }): number {
  let d = 99
  for (const u of boardUnits(state, player)) d = Math.min(d, stepDistance(u, point))
  return d
}

/** total enemy attack-power that can reach the square `at` (avatar-threat / defence estimate). */
function reachingPower(state: GameState, attackers: PlayerId, at: { x: number; y: number }): number {
  let power = 0
  for (const u of boardUnits(state, attackers)) {
    if (u.tapped) continue
    if (stepDistance(u, at) <= attackReach(state, u)) power += effAttack(state, u)
  }
  return power
}

/** a single site's per-turn mana contribution (base 1 + siteExtraMana + aura boosts). */
function siteManaOf(state: GameState, site: { id: string; name: string; x: number; y: number }): number {
  const sc = getScript(site.name)
  if (sc?.noMana) return 0
  let m = 1 + (sc?.siteExtraMana ?? 0)
  for (const r of Object.values(state.auras)) {
    const extra = getScript(r.name)?.auraSiteExtraMana
    if (extra && r.squares.some((s) => s.x === site.x && s.y === site.y)) m += extra
  }
  return m
}

/** PREDICTED site damage: for each of `owner`'s undefended sites an enemy can reach & raze, the life
 *  they'll lose (razing deals the strongest reaching attacker's power) PLUS the mana income that site
 *  will stop providing. This lets the eval "see" the obvious opponent play (raze my exposed sites)
 *  without simulating their turn — treating that value as already lost. */
function predictedSiteLoss(state: GameState, owner: PlayerId): number {
  const foe = opponent(owner)
  let loss = 0
  for (const site of Object.values(state.sites)) {
    if (site.controller !== owner || site.isRubble) continue
    if (boardUnits(state, owner).some((u) => u.x === site.x && u.y === site.y)) continue // defended
    let maxPower = 0
    for (const u of boardUnits(state, foe)) {
      if (u.tapped) continue
      if (stepDistance(u, site) <= attackReach(state, u)) maxPower = Math.max(maxPower, effAttack(state, u))
    }
    if (maxPower > 0) loss += maxPower + siteManaOf(state, site) // life razed + mana denied
  }
  return loss
}

/** read-only estimate of a player's per-turn mana income from sites (mirrors turn.ts's core:
 *  1 per active controlled site + siteExtraMana + aura boosts + enemy providesForEveryone). */
export function siteManaIncome(state: GameState, player: PlayerId): number {
  let m = 0
  for (const site of Object.values(state.sites)) {
    if (site.isRubble || siteDisabledByArtifact(state, site)) continue
    const sc = getScript(site.name)
    if (site.controller === player) {
      if (sc?.noMana) continue
      const silenced = siteSilenced(state, site)
      let gain = 1 + (silenced ? 0 : sc?.siteExtraMana ?? 0)
      for (const r of Object.values(state.auras)) {
        const extra = getScript(r.name)?.auraSiteExtraMana
        if (extra && r.squares.some((s) => s.x === site.x && s.y === site.y)) gain += extra
      }
      m += gain
    } else if (site.controller !== null && sc?.providesForEveryone) {
      m += 1 // Avalon-style: enemy site feeds everyone
    }
  }
  return m
}

/** worth of controlling `n` sites, with diminishing returns and a soft cap at 6: sites 1–4 count full,
 *  5–6 count half, a 7th+ counts nothing. Stops the bot over-extending on sites once it has enough mana. */
function siteWorth(n: number, w: EvalWeights): number {
  let v = 0
  for (let i = 1; i <= n; i++) v += i <= 4 ? w.siteMana : i <= 6 ? w.siteMana * 0.5 : 0
  return v
}

/** how well a player's affinity meets the threshold DEMAND of the cards in their deck+hand. */
export function thresholdFit(state: GameState, player: PlayerId): number {
  const aff = affinity(state, player)
  const demand = { air: 0, earth: 0, fire: 0, water: 0 }
  const p = state.players[player]
  for (const id of [...p.hand, ...p.spellbook, ...p.atlas]) {
    const t = getCard(state.cards[id].name).thresholds
    for (const e of ELEMENTS) demand[e] = Math.max(demand[e], t[e] ?? 0)
  }
  let fit = 0
  for (const e of ELEMENTS) fit += Math.min(aff[e], demand[e])
  return fit
}

/** the worth of a single non-avatar unit (from the controller's perspective, always positive). */
export function unitValue(state: GameState, u: UnitState, w: EvalWeights): number {
  if (isBlanked(u)) return w.unitCost // a blanked body is just a spent card
  const kw = effKeywords(state, u)
  // FULL defence, not remaining: non-lethal damage heals every turn, so a damaged-but-alive minion is
  // worth its full stats. (A dead minion is already off the board — this only sees survivors.)
  let v = w.unitStat * (effAttack(state, u) + effDefence(state, u))
  v += w.unitCost * (getCard(u.name).cost ?? 0)
  if (hasSupportAbility(u.name)) v += w.supportAbility
  if (kw.airborne) v += w.kwAirborne
  if (kw.ranged) v += w.kwRanged
  if (kw.lethal) v += w.kwLethal
  if (kw.stealth) v += w.kwStealth
  if (kw.ward || u.ward) v += w.kwWard
  if (kw.spellcaster) v += w.kwSpellcaster
  if (kw.immobile) v += w.kwImmobile // negative
  if (u.tapped) v -= w.tappedPenalty
  if (u.disabled || u.silenced) v -= w.disabledPenalty
  // summoning-sick: entered this turn and can't attack yet
  if (u.enteredTurn === state.turn) v -= w.summonSickPenalty
  return v
}

/** Convex life utility: linear at high life, quadratically penalised below `lowLifeThreshold`, so the
 *  marginal value of an HP RISES as life falls (life matters more when low — for both avatars). */
function lifeUtility(hp: number, w: EvalWeights): number {
  const below = Math.max(0, w.lowLifeThreshold - hp)
  return w.avatarLifePerHp * hp - w.lowLifeQuadratic * below * below
}

/** true if a friendly non-avatar unit shares the avatar's square (can defend a strike on it). */
function avatarDefended(state: GameState, player: PlayerId, avatar: UnitState): boolean {
  return boardUnits(state, player).some((u) => u.x === avatar.x && u.y === avatar.y && u.region === avatar.region)
}

const isInterrogator = (av: UnitState): boolean => av.name === 'Interrogator'

/** true if the player holds at least one Site in hand (a site the avatar could establish this turn). */
function hasSiteInHand(state: GameState, player: PlayerId): boolean {
  return state.players[player].hand.some((id) => getCard(state.cards[id].name).type === 'Site')
}

/** Auras that damage / destroy whatever occupies the SITES they cover (as opposed to buffs, or walls
 *  that only harm crossers). You want these over the OPPONENT's sites, never your own — so they're
 *  valued by coverage (enemy things under them − mine), not by who controls them. */
const HARMFUL_AREA_AURAS = new Set([
  'Wildfire', 'Thunderstorm', 'The Black Plague', 'The Great Famine', 'The Great Drowning of Men',
  'Year of the Blaze', "Castle's Ablaze!", "Hamlet's Ablaze!", 'Salt the Earth', 'Cursed Iron',
])

/** net "enemy − mine" things (sites + units) sitting under a harmful area aura's squares. Positive →
 *  it's hurting the foe (good for me); negative → it's parked on my own terrain (bad). */
function harmfulAuraCoverage(state: GameState, r: { squares: { x: number; y: number }[] }, me: PlayerId, foe: PlayerId): number {
  let net = 0
  for (const sq of r.squares) {
    for (const s of Object.values(state.sites)) {
      if (s.x === sq.x && s.y === sq.y && !s.isRubble) net += s.controller === me ? -1 : s.controller === foe ? 1 : 0
    }
    for (const u of Object.values(state.units)) {
      if (u.carriedBy || u.x !== sq.x || u.y !== sq.y) continue
      net += u.controller === me ? -1 : u.controller === foe ? 1 : 0
    }
  }
  return net
}

export interface EvalBreakdown {
  total: number
  terms: Record<string, number>
}

/** the same computation as `evaluate`, but returns a per-feature breakdown for tuning/inspection. */
export function explainEval(state: GameState, me: PlayerId, w: EvalWeights = DEFAULT_WEIGHTS): EvalBreakdown {
  const foe = opponent(me)
  const terms: Record<string, number> = {}

  if (state.winner !== null) {
    terms.terminal = state.winner === me ? w.win : -w.win
    return { total: terms.terminal, terms }
  }

  const myAv = avatarOf(state, me)
  const foeAv = avatarOf(state, foe)
  const foeIsInterrogator = isInterrogator(foeAv)
  const iAmInterrogator = isInterrogator(myAv)

  // ── life / win-proximity (NONLINEAR: an HP is worth more when low, for both avatars) ──
  terms.avatarLife = lifeUtility(myAv.life ?? 0, w) - lifeUtility(foeAv.life ?? 0, w)
  // DEALING DAMAGE is the driver — reward every point the foe is below its starting life (on top of the
  // differential). This is what pushes the bot to the face and to raze sites (razing = foe life loss).
  terms.foeLifePressure = w.foeLifePressure * Math.max(0, (getCard(foeAv.name).life ?? 20) - (foeAv.life ?? 0))
  terms.myAvatarExposed = -w.myAvatarExposed * reachingPower(state, foe, myAv)
  terms.foeAvatarThreatened = w.foeAvatarThreatened * reachingPower(state, me, foeAv)
  // Interrogator: striking the enemy avatar taxes them 3 life OR draws me a spell — so avatar
  // aggression is a genuine goal for this pilot (the search also sees it via the mechanic).
  if (iAmInterrogator) {
    terms.interrogatorAggression = w.interrogatorAggression * reachingPower(state, me, foeAv) // in-range reward
    // approach gradient — pull my nearest unit toward the foe avatar so it MARCHES into strike range,
    // unless the foe is already at death's door (then chaseDeathsDoor below owns the pull).
    if (!foeAv.deathsDoor) terms.interrogatorChase = -w.interrogatorChase * nearestUnitDistance(state, me, foeAv)
  }
  // NOTE: for other pilots, closing on the enemy avatar is NOT a general goal — dealing damage is,
  // and razing an undefended site (which drains the foe's life) is often the better route.

  // ── avatar undefended (no co-located defender) — always a small penalty, larger vs an Interrogator
  //    (an unblocked strike taxes you) and at death's door (a single strike ends it). ──
  if (!avatarDefended(state, me, myAv)) {
    terms.avatarUndefended = -(w.avatarUndefended + (foeIsInterrogator ? w.avatarUndefendedVsInterrogator : 0) + (myAv.deathsDoor ? w.avatarUndefendedDeathsDoor : 0))
  }

  // ── death's door: an avatar at 0 life dies only to real DAMAGE on a later turn. Life is floored
  // at 0, so without an explicit pull the bot never hunts the finisher (nor flees its own). ──
  if (foeAv.deathsDoor) {
    terms.foeDeathsDoor = w.foeDeathsDoor // a near-won position
    terms.chaseDeathsDoor = -w.chaseDeathsDoor * nearestUnitDistance(state, me, foeAv) // close in for the kill
  }
  if (myAv.deathsDoor) {
    terms.myDeathsDoor = -w.myDeathsDoor
    terms.fleeDeathsDoor = w.fleeDeathsDoor * nearestUnitDistance(state, foe, myAv) // keep enemies at bay
  }

  // ── material ── enemy minions count `foeUnitFactor`× (killing them is worth more; they threaten more)
  let mat = 0
  for (const u of boardUnits(state, me)) mat += unitValue(state, u, w)
  for (const u of boardUnits(state, foe)) mat -= w.foeUnitFactor * unitValue(state, u, w)
  terms.material = mat

  // ── auras in play, valued by mana cost (permanents, like units). A harmful AREA aura is valued by
  //    whose sites/units it covers (you want it on the opponent's terrain, never your own); every other
  //    aura (buffs, mana, defensive walls) is the controller's asset. ──
  let aura = 0
  for (const r of Object.values(state.auras)) {
    const cost = getCard(r.name).cost ?? 0
    if (HARMFUL_AREA_AURAS.has(r.name)) {
      aura += w.auraCost * cost * harmfulAuraCoverage(state, r, me, foe)
    } else {
      aura += (r.controller === me ? 1 : r.controller === foe ? -1 : 0) * w.auraCost * cost
    }
  }
  terms.auraValue = aura

  // ── artifacts: a MONUMENT (stationary) scores to its controller; a CARRIABLE artifact scores only
  //    while CARRIED — positive if MY unit holds it (even a foe's), negative if an ENEMY unit holds it
  //    (even mine); uncarried carriables are inert (0). ──
  let art = 0
  for (const a of Object.values(state.artifacts)) {
    const def = getCard(a.name)
    const cost = def.cost ?? 0
    if (def.subtypes?.includes('Monument')) {
      art += (a.conjuredBy === me ? 1 : a.conjuredBy === foe ? -1 : 0) * w.artifactMonument * cost
    } else if (a.carriedBy) {
      const carrier = state.units[a.carriedBy]
      if (carrier) art += (carrier.controller === me ? 1 : -1) * w.artifactCarried * cost
    }
  }
  terms.artifactValue = art

  // ── sites / board ── diminishing returns + soft cap: playing a 7th site is not prized, the 5th–6th
  //    are worth half. Keeps the bot from over-extending on sites instead of dealing damage.
  const mySites = Object.values(state.sites).filter((s) => s.controller === me && !s.isRubble).length
  const foeSites = Object.values(state.sites).filter((s) => s.controller === foe && !s.isRubble).length
  terms.siteMana = siteWorth(mySites, w) - siteWorth(foeSites, w)
  terms.thresholdFit = w.thresholdFit * thresholdFit(state, me)

  // ── avatar discipline while DEVELOPING (< 6 sites): the avatar's turn action should ESTABLISH a site
  //    (play or draw one), not be squandered on running around. Pathfinders develop via their own
  //    ability and WANT to edge toward the void — they're exempt. `avatarIdle` = still untapped (could
  //    still play/draw a site). On top of that, if it ROAMED (interactedTurn set by a move/attack/cast —
  //    a site play does NOT set it), it burned the turn wandering instead of planting: penalised extra,
  //    and DOUBLE for a WEAK avatar (power ≤ 1) whose whole job is to develop, not to fight. ──
  if (mySites < 6 && getScript(myAv.name)?.noStandardSiteAction !== true) {
    if (!myAv.tapped) {
      terms.avatarIdle = -w.avatarIdle
      if (myAv.interactedTurn === state.turn) {
        // roaming penalty, scaled by how badly it should be developing instead:
        //   WEAK avatar (power ≤ 1), < 6 sites → heaviest (its only job is to develop) → 2×
        //   STRONG avatar, < 4 sites (still early) → full penalty → 1×
        //   STRONG avatar, 4–5 sites (nearly developed) → punish, but less → 0.5×
        const weak = effAttack(state, myAv) <= 1
        const mult = weak ? 2 : mySites < 4 ? 1 : 0.5
        terms.avatarWander = -w.avatarWander * mult
      }
    }
  }

  // ── avatar Tap SQUANDERED on a non-site ability (Sorcerer's "Draw a spell", …) instead of developing.
  //    Below 4 sites the bot's move generator BANS this outright (moves.ts); the eval discourages it on a
  //    gradient for the range the ban doesn't cover: HEAVY under 5 sites, moderate at 5, SLIGHT at 6, and
  //    NOTHING above 6 (fully developed — the avatar's Tap is free to be spent however). Set by the
  //    activate handler (game.ts); Pathfinders never trip it (never flagged). ──
  if (getScript(myAv.name)?.noStandardSiteAction !== true && mySites <= 6 && state.flow?.avatarTapAbility?.[me] === state.turn) {
    const mult = mySites < 5 ? 1 : mySites < 6 ? 0.5 : 0.2 // heavy < 5, moderate at 5, slight at 6
    terms.avatarTapWaste = -w.avatarTapWaste * mult
  }
  terms.exposedSite = -w.exposedSite * predictedSiteLoss(state, me) // my sites the foe can raze (life + mana)
  terms.foeExposedSite = w.foeExposedSite * predictedSiteLoss(state, foe) // enemy sites I can raze

  // ── HOME TERRITORY: the 6 squares nearest your avatar — columns b–d (x 1–3), your two back rows.
  //    Fill your home before expanding; keep the enemy out of it; and around a Harbinger, respect the
  //    portent slots (plant on YOURS, never on the enemy's). ──
  const homeRows = me === 0 ? [0, 1] : [2, 3]
  const inHome = (x: number, y: number) => x >= 1 && x <= 3 && homeRows.includes(y)
  const enemyHarb = (state.flow?.harbinger?.[foe] ?? []) as { x: number; y: number }[]
  const myHarb = (state.flow?.harbinger?.[me] ?? []) as { x: number; y: number }[]
  const isEnemyHarbSlot = (x: number, y: number) => enemyHarb.some((s) => s.x === x && s.y === y)
  const isMyHarbSlot = (x: number, y: number) => myHarb.some((s) => s.x === x && s.y === y)

  let homeIntruders = 0, myOnEnemyHarb = 0, myOnMyHarb = 0, mySitesOutsideHome = 0
  for (const s of Object.values(state.sites)) {
    if (s.isRubble) continue
    if (s.controller === foe && inHome(s.x, s.y)) homeIntruders++ // enemy squatting in my home
    if (s.controller === me) {
      if (isEnemyHarbSlot(s.x, s.y)) myOnEnemyHarb++ // I planted on the enemy's portent (blocks nothing useful)
      if (isMyHarbSlot(s.x, s.y)) myOnMyHarb++        // I planted on my OWN portent — good
      if (!inHome(s.x, s.y)) mySitesOutsideHome++
    }
  }
  terms.homeIntruded = -w.homeIntruded * homeIntruders            // SEVERE — an enemy site inside my home
  terms.harbingerEnemySlot = -w.harbingerEnemySlot * myOnEnemyHarb // HEAVY — wasting a site on the enemy's slot
  terms.harbingerOwnSlot = w.harbingerOwnSlot * myOnMyHarb         // prized — developing onto my own portents

  // premature expansion: a NON-Pathfinder holding sites OUTSIDE home while its home still has fillable
  // voids. A void that is an ENEMY harbinger slot doesn't count (I shouldn't plant there anyway).
  if (mySitesOutsideHome > 0 && getScript(myAv.name)?.noStandardSiteAction !== true) {
    let fillableHomeVoids = 0
    for (const x of [1, 2, 3]) for (const y of homeRows) if (!siteAt(state, x, y) && !isEnemyHarbSlot(x, y)) fillableHomeVoids++
    if (fillableHomeVoids > 0) terms.homePremature = -w.homePremature * mySitesOutsideHome
  }

  // ── economy / cards ──
  // A SITE in hand is an inert mana source, not a flexible 3-HP resource — its worth is realised by
  // PLAYING it (siteMana/siteControl), not by holding it. Counting it as a full card creates a hoarding
  // trap: holding a site (30) beats playing it (+45 board − 30 lost hand = +15 net), so the bot never
  // develops its mana, never casts, never defends. Count only SPELLS in my (known) hand.
  const mySpellsInHand = state.players[me].hand.filter((id) => getCard(state.cards[id].name).type !== 'Site').length
  terms.myHand = w.myHand * mySpellsInHand
  terms.foeHand = w.foeHand * state.players[foe].hand.length // foe's hand is hidden → all cards unknown
  terms.cemeteryPlayable = w.cemeteryPlayable * cemeteryActivations(state, me).length
  const draws = state.players[me].spellbook.length + state.players[me].atlas.length
  terms.deckoutRisk = -w.deckoutRisk * Math.max(0, 5 - draws)

  let total = 0
  for (const k in terms) total += terms[k]
  return { total, terms }
}

/** Static evaluation of `state` from `me`'s perspective. Higher is better for `me`. */
export function evaluate(state: GameState, me: PlayerId, w: EvalWeights = DEFAULT_WEIGHTS): number {
  return explainEval(state, me, w).total
}
