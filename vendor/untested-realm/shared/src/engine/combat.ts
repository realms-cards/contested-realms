// Move & Attack, Defend, Intercept, fights, projectiles.

import { getScript } from '../cards/scripts/registry'
import { findCard } from '../cards/db'
import { pickUpUnits, dropUnits, syncCarried, detachFromCarrier } from './carrying'
import type { GameState, PlayerId, Region, Step, UnitState, AttackTarget } from './types'
import { pushLog, pushPrompt, registerCont, dealDamageToUnit, dealDamage, checkStateBased, opponent, makeCtx, emitUnitMoved, gainLife, tapUnit, emitEvent, drawCards, askDrawCard, recordAreaReveal, markRevealShoots, beginAreaReveal, sealAbilityReveal, beginBattleCapture, finishBattleCapture, avatarTrappedAt, isMagicProtected } from './effects'
import { effAttack, effKeywords, isDisabled, canTap, projectileCanHit, attackBlockedAt, interceptBlockedAt, siteSilenced as siteSilencedC, artScript, regionPresentAt, carriedInside, isBlanked, isCarriableArtifact } from './statics'
import { findPath, isFreeStep, isLegalStep, maxSteps, reachableLocations, reachableWithPaths, resolveMovement } from './movement'
import { unitsAt, occupies, occupiedSquares, inBounds, edgesConnected, GRID_W, GRID_H, squareLabel } from './grid'

// ---------- entry: the Move and Attack basic ability ----------

export function moveAttack(state: GameState, player: PlayerId, unitId: string, path: Step[], attack?: AttackTarget): string | null {
  const unit = state.units[unitId]
  if (!unit) return 'No such unit.'
  if (unit.controller !== player) return 'Not your unit.'
  if (isDisabled(state, unit)) return `${unit.name} is disabled.`
  if (!canTap(state, unit)) return unit.tapped ? `${unit.name} is already tapped.` : `${unit.name} has summoning sickness.`
  // path budget: free steps cost 0
  {
    let cost = 0
    let cur = { x: unit.x, y: unit.y, region: unit.region }
    for (const step of path) {
      cost += isFreeStep(state, unit, cur, step) ? 0 : 1
      cur = step
    }
    if (cost > maxSteps(state, unit)) return `${unit.name} can take at most ${maxSteps(state, unit)} step(s).`
  }

  // while it resolves its own Move & Attack the unit is NOT "at rest", so an at-rest disabler
  // (Hillock Basilisk / Stone-gaze Gorgons) doesn't bite it — it finishes the attack, then is
  // disabled once it comes to rest. Non-at-rest disablers (Root Spider, Babbling Brook, auras)
  // still resolve between the move and the attack and can stop it (line below).
  state.flow = state.flow ?? {}
  const prevActing = state.flow.actingUnitId
  state.flow.actingUnitId = unitId
  try {
    tapUnit(state, unit)
    const taken = resolveMovement(state, unit, path)
    // Blaze: when the runner stops, the trail detonates (2 damage along it)
    const blaze = (state.flow?.blazeTrail ?? []).find((e: any) => e.unitId === unitId && e.turn === state.turn)
    if (blaze && blaze.squares.length) {
      for (const sq of blaze.squares as { x: number; y: number }[]) {
        for (const u of unitsAt(state, sq.x, sq.y, 'surface')) {
          if (u.id === unitId) continue // the runner does not burn in its own trail
          // the trail is the Blaze spell's damage: tag it as Fire magic so magic-protection (Failed Mutation) and fire interactions apply
          dealDamageToUnit(state, u, 2, player, { source: { player, kind: 'magic', name: 'Blaze', elements: ['Fire'] } })
        }
      }
      pushLog(state, player, 'The fire trail erupts!')
      state.flow.blazeTrail = state.flow.blazeTrail.filter((e: any) => e.unitId !== unitId)
      checkStateBased(state)
      if (!state.units[unitId]) return null
    }
    if (taken > 0) {
      if (unit.carriedBy) detachFromCarrier(state, unit) // moving on your own ends the ride
      syncCarried(state, unit)
      pushLog(state, player, `${unit.name} moves to ${squareLabel(unit.x, unit.y)}${unit.region !== 'surface' ? ' ' + unit.region : ''}.`)
    }
    // stealth is lost when the minion interacts; moving alone doesn't break it

    if (attack) {
      // area/site statics resolve BETWEEN the move and the attack of a Move & Attack:
      // if arriving here disabled the unit (a Root Spider burrowed below it, Babbling Brook, an
      // aura...), it can move onto the square but cannot then attack from it this action. An "at
      // rest" disabler (Basilisk / Gorgons) is skipped here — the unit isn't at rest yet.
      if (isDisabled(state, unit)) {
        pushLog(state, player, `${unit.name} is disabled on arrival and cannot attack.`)
        offerIntercept(state, unit)
        return null
      }
      // An entry trigger may have interposed a prompt during the movement — e.g. Sold-out Cemetery makes
      // the SITE's controller push another Undead out of the square the mover just entered. Per the
      // rulebook the attack target is declared only AFTER all movement (and its triggers) resolve, so we
      // PARK the attack and let the applyAction boundary resume it (resolvePendingMoveAttack) once the
      // queue is clear — re-validating the declared target, which the interposed effect may have moved,
      // and re-prompting the attacker to retarget (or end movement) if it did. The GUI still declares the
      // attack up front as a simplification; this only changes how the ENGINE resolves it.
      if (state.prompts.length > 0) {
        state.flow.pendingMoveAttack = { unitId: unit.id, attack }
        return null
      }
      // no interposed prompt — resolve the attack now, but an AUTO-resolved entry effect (a Sold-out
      // Cemetery with a single Undead and a single exit) may already have moved the target, so go
      // through the same re-validate/retarget path rather than blindly attacking.
      finishMoveAttack(state, unit, attack)
      return null
    }
    offerIntercept(state, unit)
    return null
  } finally {
    state.flow.actingUnitId = prevActing // it has come to rest → an at-rest disabler now bites
  }
}

// ---------- deferred Move & Attack (target declared after all movement + its triggers) ----------

/** Is the declared attack target still present where the mover now stands? An entry trigger (Sold-out
 *  Cemetery pushing an Undead), a death, etc. may have removed it while it resolved. */
function attackTargetPresent(state: GameState, unit: UnitState, attack: AttackTarget): boolean {
  if ('unit' in attack) {
    const t = state.units[attack.unit]
    if (!t || carriedInside(state, t)) return false
    return t.region === unit.region && occupiedSquares(unit).some((a) => occupies(t, a.x, a.y))
  }
  const site = state.sites[attack.site]
  return !!site && !site.isRubble && occupies(unit, site.x, site.y, 'surface')
}

/** enemy units the mover could legally attack from where it now stands — the retarget menu when its
 *  originally declared target has been moved away. */
function coLocatedAttackTargets(state: GameState, unit: UnitState): string[] {
  const kw = effKeywords(state, unit)
  const truesight = unit.carrying.some((id) => getScript(state.artifacts[id]?.name ?? '')?.bearerTruesight)
  return unitsAt(state, unit.x, unit.y, unit.region)
    .filter((t) => {
      if (t.id === unit.id || t.controller === unit.controller || t.carriedBy) return false
      if (t.stealth && !truesight) return false
      if (effKeywords(state, t).airborne && !kw.airborne && t.region === 'surface') return false
      if (t.region === 'surface' && attackBlockedAt(state, t.x, t.y, t)) return false
      return true
    })
    .map((t) => t.id)
}

/** Resolve the attack step of a Move & Attack now that all movement (and its triggers) have settled:
 *  attack the declared target if it's still here, else let the attacker declare a NEW target (or end
 *  movement with no attack). Shared by the immediate path (moveAttack) and the deferred path
 *  (resolvePendingMoveAttack). */
function finishMoveAttack(state: GameState, unit: UnitState, attack: AttackTarget): void {
  if (isDisabled(state, unit)) { offerIntercept(state, unit); return }
  if (attackTargetPresent(state, unit, attack)) {
    const err = beginAttack(state, unit, attack)
    if (err) { pushLog(state, unit.controller, `${unit.name} cannot attack: ${err}`); offerIntercept(state, unit) }
    return
  }
  const candidates = coLocatedAttackTargets(state, unit)
  if (!candidates.length) {
    pushLog(state, unit.controller, `${unit.name}'s quarry slipped away — its attack finds no target.`)
    offerIntercept(state, unit)
    return
  }
  pushPrompt(state, {
    player: unit.controller,
    kind: 'chooseTargets',
    title: `${unit.name}'s target was moved away — attack whom instead? (or none)`,
    data: { candidates, count: 1, upTo: true, kind: 'unit' },
    cont: 'combat:retarget',
    ctx: { unitId: unit.id },
  })
}

/** Resume a Move & Attack whose attack was PARKED because an entry trigger interposed a prompt (see
 *  moveAttack). Called at the applyAction boundary once the prompt queue clears. */
export function resolvePendingMoveAttack(state: GameState): void {
  const pend = state.flow?.pendingMoveAttack as { unitId: string; attack: AttackTarget } | undefined
  if (!pend) return
  state.flow.pendingMoveAttack = undefined
  const unit = state.units[pend.unitId]
  if (unit) finishMoveAttack(state, unit, pend.attack)
}

// the attacker declared a new target after its original one was moved away (or declined → end movement)
registerCont('combat:retarget', (state, ctx: { unitId: string }, choice) => {
  const unit = state.units[ctx.unitId]
  if (!unit) return
  const id = Array.isArray(choice) ? choice[0] : choice
  if (typeof id === 'string' && state.units[id]) {
    const err = beginAttack(state, unit, { unit: id })
    if (err) { pushLog(state, unit.controller, `${unit.name} cannot attack: ${err}`); offerIntercept(state, unit) }
  } else {
    offerIntercept(state, unit) // declined → the movement ends with no attack
  }
})

// ---------- attacking ----------

export function beginAttack(
  state: GameState,
  attacker: UnitState,
  attack: AttackTarget,
  opts?: { allowAllied?: boolean; allowSubsurface?: boolean },
): string | null {
  const player = attacker.controller
  const kw = effKeywords(state, attacker)

  // Peace Offering: the gifted player can't attack the giver on their next turn
  const truceTarget = 'unit' in attack ? state.units[attack.unit]?.controller : state.sites[attack.site]?.controller
  for (const t of (state.flow?.peaceTruce ?? []) as { bound: PlayerId; protectedPlayer: PlayerId; turn: number }[]) {
    if (t.bound === player && truceTarget === t.protectedPlayer && state.turn > t.turn) {
      return 'the Peace Offering binds you — no attacks against them this turn'
    }
  }

  if ('unit' in attack) {
    const target = state.units[attack.unit]
    if (!target) return 'no such unit'
    if (isBlanked(target)) return 'that card is face down — it is not a unit' // a blanked husk isn't a unit (FAQ)
    if (carriedInside(state, target)) return 'that unit is swallowed — it is out of reach' // in a belly
    if (target.controller === player && !opts?.allowAllied) return 'you cannot attack your own unit'
    if (target.id === attacker.id) return 'it cannot attack itself'
    // shared square + same region (either combatant may be oversized)
    const sameSquare = occupiedSquares(attacker).some((a) => occupies(target, a.x, a.y))
    // Putrid Presence: the subsurface of nearby sites can be attacked from above
    const digDown =
      sameSquare &&
      attacker.region === 'surface' &&
      (target.region === 'underground' || target.region === 'underwater') &&
      Object.values(state.units).some((u) => {
        const f = getScript(u.name)?.allowsSubsurfaceAttackAt
        return f && !u.silenced && f(state, u.id, target.x, target.y)
      })
    // allowSubsurface: a SITE-sourced attacker (Free City) reaches down into its own subsurface — it may
    // strike a burrowed/submerged enemy sharing its square without needing a Putrid-Presence dig.
    const overlap = sameSquare && (target.region === attacker.region || digDown || !!opts?.allowSubsurface)
    if (!overlap) return 'target is not at your location'
    const tkw = effKeywords(state, target)
    if (tkw.airborne && !kw.airborne && target.region === 'surface') return 'only Airborne units can attack an Airborne unit'
    const truesight = attacker.carrying.some((id) => getScript(state.artifacts[id]?.name ?? '')?.bearerTruesight)
    if (target.stealth && !truesight) return 'that minion has Stealth'
    if (target.region === 'surface' && attackBlockedAt(state, target.x, target.y, target)) return 'that location is protected from attacks'
    // start the two-sided battle reveal BEFORE the declaration log so it's captured. The snapshot
    // survives the defend / allocate prompts in flow.pendingBattle.
    beginBattleCapture(state, attacker, { x: target.x, y: target.y }, target.id)
    pushLog(state, player, `${attacker.name} attacks ${target.name}!`)
    // Stealth is NOT broken yet: a Stealth minion's attack can't be defended and the
    // attacker can't be targeted by the opponent's "when attacked" abilities. Stealth
    // is dropped inside openDefendWindow, after the (un)defendable window is decided.
    // "whenever X is attacked" responses fire before the defend window; their
    // prompts resolve first, and fightSides drops a target that got away.
    // (A "fight" — Pudge Butcher, Lord of Lies… — is NOT an attack and never comes here: it goes
    // straight to the strike exchange via fightUnits, firing no "when attacked" and no defend window.)
    emitEvent(state, 'onUnitAttacked', target, attacker)
    openDefendWindow(state, attacker, { unitId: target.id })
    return null
  }

  const site = state.sites[attack.site]
  if (!site) return 'no such site'
  if (site.controller === player || site.controller === null) return 'you can only attack enemy sites'
  if (getScript(attacker.name)?.cantAttackSites && !attacker.silenced) return `${attacker.name} cannot attack sites`
  if (attackBlockedAt(state, site.x, site.y)) return 'that site is protected from attacks'
  if (!occupies(attacker, site.x, site.y, 'surface')) return 'you must be on the surface of that site'
  beginBattleCapture(state, attacker, { x: site.x, y: site.y })
  pushLog(state, player, `${attacker.name} attacks ${site.name}!`)
  // Stealth is dropped inside openDefendWindow (after the undefendable window is
  // decided) so the Stealth minion's attack correctly can't be defended.
  openDefendWindow(state, attacker, { siteId: site.id })
  return null
}

// ---------- The Green Knight: "Whenever an enemy minion CAN attack The Green Knight, it MUST." ----------
//
// Enforced PROACTIVELY at the applyAction boundary (see game.ts) — so it re-checks at the start of the
// enemy's turn and after every one of their actions. Any of the active player's untapped minions that
// can legally attack a live Green Knight — in place OR by moving and attacking — is compelled to do so.
// This IS an attack (not a fight): it opens the normal defend window, so the Knight's controller may
// call in defenders. When several minions can attack, THEIR controller (the active player) chooses the
// order: we prompt them for the next attacker and repeat until one or none remain.

/** The best route by which `attacker` can attack `target` right now — an empty path if it can strike in
 *  place, else the shortest move onto the target's square — or null if it cannot legally attack it. The
 *  position-independent rules here MIRROR beginAttack's unit-attack checks (keep them in sync). */
function compelledAttackPath(state: GameState, attacker: UnitState, target: UnitState): Step[] | null {
  // must be able to reach the target's square (co-locate) — in place, or by a legal move
  const here: Step = { x: attacker.x, y: attacker.y, region: attacker.region }
  const options: { dest: Step; path: Step[] }[] = [{ dest: here, path: [] }, ...reachableWithPaths(state, attacker)]
  const onto = options.filter((o) => o.dest.x === target.x && o.dest.y === target.y && o.dest.region === target.region)
  if (!onto.length) return null
  // ── the same legality beginAttack enforces, minus the (now-satisfied) co-location ──
  if (carriedInside(state, target)) return null
  const kw = effKeywords(state, attacker)
  const tkw = effKeywords(state, target)
  if (tkw.airborne && !kw.airborne && target.region === 'surface') return null // only Airborne attacks Airborne
  const truesight = attacker.carrying.some((id) => getScript(state.artifacts[id]?.name ?? '')?.bearerTruesight)
  if (target.stealth && !truesight) return null
  if (target.region === 'surface' && attackBlockedAt(state, target.x, target.y, target)) return null
  for (const t of (state.flow?.peaceTruce ?? []) as { bound: PlayerId; protectedPlayer: PlayerId; turn: number }[]) {
    if (t.bound === attacker.controller && target.controller === t.protectedPlayer && state.turn > t.turn) return null
  }
  onto.sort((a, b) => a.path.length - b.path.length) // strike in place if possible, else the shortest walk
  return onto[0].path
}

/** live Green Knights (taunt active) that the CURRENT active player's minions must attack. */
function activeTaunts(state: GameState): UnitState[] {
  const active = state.activePlayer
  return Object.values(state.units).filter(
    (k) => !k.isAvatar && !k.silenced && !isDisabled(state, k) && k.controller !== active && getScript(k.name)?.enemiesMustAttackMe,
  )
}

/** the active player's untapped minions that can attack a taunting Knight, each with a chosen route. */
function pendingCompelledAttacks(state: GameState): { unitId: string; knightId: string; path: Step[] }[] {
  const active = state.activePlayer
  const knights = activeTaunts(state)
  if (!knights.length) return []
  const avatarId = state.players[active].avatarUnitId
  const out: { unitId: string; knightId: string; path: Step[] }[] = []
  for (const m of Object.values(state.units)) {
    if (m.controller !== active || m.isAvatar || m.id === avatarId || m.tapped || m.carriedBy) continue
    if (isDisabled(state, m) || !canTap(state, m)) continue
    for (const k of knights) {
      const path = compelledAttackPath(state, m, k)
      if (path) { out.push({ unitId: m.id, knightId: k.id, path }); break } // one target per compelled minion
    }
  }
  return out
}

function launchCompelledAttack(state: GameState, unitId: string, knightId: string, path: Step[]): void {
  const m = state.units[unitId]
  const k = state.units[knightId]
  if (!m || !k) return
  pushLog(state, m.controller, `The Green Knight compels ${m.name} — it must attack!`)
  moveAttack(state, m.controller, unitId, path, { unit: knightId })
  checkStateBased(state)
}

/** Proactively resolve The Green Knight's taunt. Call at the applyAction boundary when no prompt is
 *  open. Forces one attack at a time; when the choice of WHICH minion attacks next is open (several
 *  can), it prompts the attacking (minion-controller) player to pick the order. */
export function enforceForcedAttacks(state: GameState): void {
  for (let guard = 0; guard < 64; guard++) {
    if (state.prompts.length > 0 || state.phase !== 'main' || state.winner !== null) return
    const pending = pendingCompelledAttacks(state)
    if (!pending.length) return
    if (pending.length === 1) {
      // no order to choose — compel it. If it opens a defend window, the loop returns at the top; if it
      // resolved undefended, we loop to catch any further compelled attacker.
      launchCompelledAttack(state, pending[0].unitId, pending[0].knightId, pending[0].path)
      continue
    }
    // several can attack → the minions' controller chooses the order: prompt for the NEXT attacker.
    pushPrompt(state, {
      player: state.activePlayer,
      kind: 'chooseTargets',
      title: 'The Green Knight compels your minions — which attacks it?',
      data: { candidates: pending.map((p) => p.unitId), count: 1, upTo: false, kind: 'unit', notTargeted: true },
      cont: 'forceAttack',
      ctx: { knightByUnit: Object.fromEntries(pending.map((p) => [p.unitId, p.knightId])) },
    })
    return
  }
}

// the attacking player picked which compelled minion strikes next — launch it (re-deriving the route so
// it stays legal); the boundary re-runs enforceForcedAttacks afterwards to compel the rest.
registerCont('forceAttack', (state, ctx: { knightByUnit: Record<string, string> }, choice) => {
  const id = Array.isArray(choice) ? choice[0] : choice
  if (typeof id !== 'string') return
  const m = state.units[id]
  const knightId = ctx.knightByUnit?.[id]
  const k = knightId ? state.units[knightId] : null
  if (!m || !k) return
  const path = compelledAttackPath(state, m, k)
  if (path) launchCompelledAttack(state, id, knightId, path)
})

export function breakStealth(state: GameState, unit: UnitState): void {
  // breakStealth is called at the unit's realm-interaction moments (declaring an attack,
  // firing a Ranged shot, or a triggered projectile like Colicky Dragonettes' end-of-turn
  // hiccup) — record the interaction so the Drop basic ability is disallowed this turn, then
  // spend the Stealth token if present.
  unit.interactedTurn = state.turn
  if (unit.stealth) {
    unit.stealth = false
    pushLog(state, unit.controller, `${unit.name} loses Stealth.`)
  }
}

interface FightCtx {
  attackerId: string
  /** true when the attacker initiated this fight with an attack (not an interception) */
  isAttack?: boolean
  targetUnitId?: string
  siteId?: string
  defenderIds: string[]
  targetStays: boolean
  stage: 'strikeFirst' | 'normal'
  /** striker id → damage split among enemy unit ids (sums to the striker's power) */
  allocations: Record<string, Record<string, number>>
  /** striker ids already resolved (struck or died) */
  struck: string[]
  /** enemy unit ids alive when this attack began — the pool "attacks and kills" (onAttackKill)
   *  scopes over, so an attacker with a splash weapon (Flaming Sword) draws once per enemy its
   *  attack fells, not just its single struck target, while staying scoped to THIS attack. */
  enemiesAtStart?: string[]
}

function openDefendWindow(state: GameState, attacker: UnitState, target: { unitId?: string; siteId?: string }): void {
  const defenderP = opponent(attacker.controller)
  // The fight happens where the attacker ENGAGED the target — the square they share — NOT the target's
  // anchor. These differ when an OVERSIZED or Rack-stretched target is struck on a non-anchor part: the
  // attacker stands on that part, and defender eligibility is measured from THERE, regardless of the
  // target's size. (There is no privileged "main body" square.)
  const tUnit = target.unitId ? state.units[target.unitId] : null
  const tSite = target.siteId ? state.sites[target.siteId] : null
  const engaged = tUnit ? occupiedSquares(attacker).find((a) => occupies(tUnit, a.x, a.y)) : undefined
  const loc: Step = tUnit
    ? { x: engaged?.x ?? tUnit.x, y: engaged?.y ?? tUnit.y, region: tUnit.region }
    : tSite
      ? { x: tSite.x, y: tSite.y, region: 'surface' }
      : { x: attacker.x, y: attacker.y, region: attacker.region }

  // a site attacked directly may rise to defend ITSELF (Free City musters its 3/3 garrison) — the hook
  // spawns a pseudo-defender at the site, which the candidate scan below then offers like any defender.
  if (tSite && tSite.controller !== null && !siteSilencedC(state, tSite)) {
    const hook = getScript(tSite.name)?.onSiteAttacked
    if (hook) hook(makeCtx(state, tSite.id, tSite.controller, []), attacker)
  }

  let candidates: UnitState[] = []
  let undefendable = getScript(attacker.name)?.cantBeDefended && !attacker.silenced
  // Dread Thicket: the first attack out of the site each turn can't be defended
  {
    const home = state.sites[Object.values(state.sites).find((s) => s.x === attacker.x && s.y === attacker.y && !s.isRubble)?.id ?? '']
    const hook = home ? getScript(home.name)?.siteMakesAttackUndefended : undefined
    if (home && hook && !siteSilencedC(state, home) && hook(state, home, attacker)) undefendable = true
  }
  // Sphere of Animosity: trapped avatars can't be defended
  {
    const tAvatar = target.unitId ? state.units[target.unitId] : null
    if (tAvatar?.isAvatar && avatarTrappedAt(state, tAvatar.x, tAvatar.y)) undefendable = true
  }
  // Kiss of Judas: attacks on the kissed Avatar can't be defended; the caster draws
  for (const kiss of (state.flow?.judasKiss ?? []) as { avatarId: string; byPlayer: PlayerId }[]) {
    if (kiss.avatarId === target.unitId) {
      undefendable = true
      askDrawCard(state, kiss.byPlayer) // "draw a card": caster chooses spellbook or atlas
      pushLog(state, kiss.byPlayer, 'Kiss of Judas: you draw a card.')
    }
  }
  // A Stealth minion's attack can't be defended (rulebook: Stealth). This is why
  // stealth is read here BEFORE it is broken: the attacker keeps its Stealth benefit
  // for the attack it is declaring. Only the LIVE token (unit.stealth) counts —
  // rulebook: "Stealth is tracked with a stealth token, and it's lost after the
  // minion interacts". The printed keyword must NOT re-apply once the token is
  // spent (a revealed Band of Thieves attacks defendably ever after).
  // (negative-control proven: re-adding the printed-keyword term turns the
  // faq.test.ts "printed Stealth does NOT come back" test red)
  if (!attacker.stealth && !undefendable) {
    const reaches = (u: UnitState) =>
      reachableLocations(state, u).some((s) => s.x === loc.x && s.y === loc.y && s.region === loc.region)
    candidates = Object.values(state.units).filter((u) => {
      if (u.controller !== defenderP || u.id === target.unitId) return false
      if (!canTap(state, u) || isDisabled(state, u)) return false
      if (getScript(u.name)?.cantDefendEver && !u.silenced) return false
      // a CARRIED minion never defends on its own — it can only join the fight TOGETHER WITH
      // its carrier, so it's offered exactly when its carrier could defend (and bring it).
      if (u.carriedBy) {
        const c = state.units[u.carriedBy]
        if (!c || !canTap(state, c) || isDisabled(state, c)) return false
        if (occupies(c, loc.x, loc.y, loc.region)) return true // carrier already at the fight
        if (getScript(c.name)?.cantDefend && !c.silenced) return false
        return reaches(c)
      }
      if (occupies(u, loc.x, loc.y, loc.region)) return true
      // "can't move to defend" minions may only defend in place
      if (getScript(u.name)?.cantDefend) return false
      return reaches(u)
    })
  }

  // the attack IS the interaction that breaks Stealth — now that the (un)defendable
  // window has been decided, the token is spent.
  breakStealth(state, attacker)

  const ctx: FightCtx = {
    attackerId: attacker.id,
    isAttack: true, // openDefendWindow is reached only by real attacks; a fight uses fightUnits directly
    targetUnitId: target.unitId,
    siteId: target.siteId,
    defenderIds: [],
    targetStays: true,
    stage: 'strikeFirst',
    allocations: {},
    struck: [],
    enemiesAtStart: Object.values(state.units).filter((u) => u.controller !== attacker.controller).map((u) => u.id),
  }

  // Combatants are NOT "at rest" until the battle fully resolves, so an at-rest disabler (Hillock
  // Basilisk / Stone-gaze Gorgons) can't freeze one mid-fight — including a Basilisk that itself moves
  // in to defend. Seed with the attacker + target; defenders join as they commit / when sides resolve.
  state.flow = state.flow ?? {}
  state.flow.battleUnits = [attacker.id, ...(target.unitId ? [target.unitId] : [])]

  if (candidates.length === 0) {
    afterDefenders(state, ctx)
    return
  }
  pushPrompt(state, {
    player: defenderP,
    kind: 'defend',
    title: `${attacker.name} attacks ${target.unitId ? state.units[target.unitId!]?.name : state.sites[target.siteId!]?.name}. Tap defenders?`,
    data: {
      candidates: candidates.map((u) => u.id),
      attackLocation: loc,
      attackerId: attacker.id,
      target: target.unitId ? { unit: target.unitId } : { site: target.siteId }, // for the client's golden target glow
    },
    cont: 'combat:defenders',
    ctx,
  })
}

registerCont('combat:defenders', (state, ctx: FightCtx, choice: string[]) => {
  const attacker = state.units[ctx.attackerId]
  if (!attacker) return
  const loc: Step = { x: attacker.x, y: attacker.y, region: attacker.region }
  let chosen = Array.isArray(choice) ? choice : []
  // Lord of Fear: enemies can't defend alone
  if (chosen.length === 1) {
    const fear = Object.values(state.units).some(
      (u) => u.controller === attacker.controller && !u.silenced && getScript(u.name)?.enemiesCantDefendAlone,
    )
    if (fear) {
      pushLog(state, opponent(attacker.controller), 'Terror grips the lone defender — enemies of the Lord of Fear cannot defend alone.')
      chosen = []
    }
  }
  const reachesLoc = (u: UnitState) =>
    reachableLocations(state, u).some((s) => s.x === loc.x && s.y === loc.y && s.region === loc.region)
  const atLoc = (u: UnitState | undefined): boolean => !!u && u.x === loc.x && u.y === loc.y && u.region === loc.region
  const commit = (u: UnitState) => {
    tapUnit(state, u)
    ctx.defenderIds.push(u.id)
    state.flow = state.flow ?? {}
    state.flow.battleUnits = [...new Set([...(state.flow.battleUnits ?? []), u.id])] // now a combatant → exempt from at-rest disable
    pushLog(state, u.controller, `${u.name} defends!`)
    emitEvent(state, 'onAllyDefends', state.units[u.id])
  }

  // Pass 1 — non-carried defenders (carriers included) tap and WALK to the fight; per-step
  // effects (Wall of Fire, Brambles, enter-square triggers) apply along the way. A carrier
  // that defends drags its cargo along (syncCarried), setting up its riders for Pass 2.
  for (const id of chosen) {
    const u = state.units[id]
    if (!u || u.carriedBy || u.controller === attacker.controller || !canTap(state, u) || isDisabled(state, u)) continue
    if (!atLoc(u)) {
      if (!reachesLoc(u)) continue
      tapUnit(state, u)
      const path = findPath(state, u, loc)
      if (path) resolveMovement(state, u, path)
      const survivor = state.units[id]
      if (!survivor) { pushLog(state, null, `${u.name} never reaches the fight.`); continue }
      if (!atLoc(survivor)) continue
      syncCarried(state, survivor)
      ctx.defenderIds.push(id)
      pushLog(state, u.controller, `${u.name} defends!`)
      emitEvent(state, 'onAllyDefends', state.units[id])
    } else {
      commit(u)
    }
  }

  // Pass 2 — a CARRIED minion joins the defense ONLY if its carrier ALSO defended (and so
  // reached the fight, bringing it). A rider chosen without its carrier can't defend alone.
  for (const id of chosen) {
    const u = state.units[id]
    if (!u || !u.carriedBy || u.controller === attacker.controller || !canTap(state, u) || isDisabled(state, u)) continue
    const carrier = state.units[u.carriedBy]
    if (!carrier || !ctx.defenderIds.includes(carrier.id) || !atLoc(u)) continue
    commit(u)
  }
  afterDefenders(state, ctx)
})

function afterDefenders(state: GameState, ctx: FightCtx): void {
  // a defended site is automatically removed from the fight
  if (ctx.siteId && ctx.defenderIds.length > 0) ctx.siteId = undefined

  if (ctx.targetUnitId && ctx.defenderIds.length > 0) {
    // the defender's controller decides if the original target stays in
    const target = state.units[ctx.targetUnitId]
    if (target) {
      pushPrompt(state, {
        player: target.controller,
        kind: 'stayInFight',
        title: `Does ${target.name} remain in the fight?`,
        // attacker + committed defenders exposed so a bot (or UI) can weigh whether staying is safe
        data: { unitId: target.id, attackerId: ctx.attackerId, defenderIds: [...ctx.defenderIds] },
        cont: 'combat:stay',
        ctx,
      })
      return
    }
  }
  startFight(state, ctx)
}

registerCont('combat:stay', (state, ctx: FightCtx, choice: boolean) => {
  ctx.targetStays = !!choice
  startFight(state, ctx)
})

function startFight(state: GameState, ctx: FightCtx): void {
  const attacker = state.units[ctx.attackerId]
  if (!attacker) return

  // undefended site attack: just strike the site
  if (ctx.siteId && ctx.defenderIds.length === 0) {
    const site = state.sites[ctx.siteId]
    // some attackers may do something else INSTEAD of a successful site strike
    // (Dame Britomart) — their script prompts and resolves via strikeSite()
    const choice = getScript(attacker.name)?.siteStrikeChoice
    if (site && choice && !attacker.silenced && choice(makeCtx(state, attacker.id, attacker.controller, []), site.id)) {
      return
    }
    if (site) strikeSite(state, attacker.id, site.id)
    checkStateBased(state)
    // an undefended SITE strike is still an attack — fire afterAttack/afterAllyAttack so
    // "attacked this turn" bookkeeping (Redcap Powries, Sir Agravaine…) runs, exactly as it
    // does when a fight resolves via runFightPass.
    fireAfterAttack(state, ctx)
    return
  }
  runFightPass(state, ctx)
}

/** A forced FIGHT between two arbitrary units (Lord of Lies, Duel, Joust, Instigator Imp, Giant Shark,
 *  Meat Hook, Awakened Mummies, "simultaneous fight" magics…). They strike each other SIMULTANEOUSLY
 *  through the real combat machinery, so every strike trigger fires — onStrike / onSelfStruck, Lethal,
 *  strike-first, wards, lances, kill + everKilled/onKill, AND onAllyStrikesAvatar (Interrogator:
 *  "whenever an ally strikes an enemy Avatar…"). Card scripts that dealt raw damage for a fight skipped
 *  all of these. A fight is NOT an attack: it needs no co-location (attacking-your-own / adjacency /
 *  Airborne are Move-and-Attack rules only), opens no defend window, fires no "when attacked", and runs
 *  no afterAttack. `a` is nominally the attacker but both sides strike; `b` goes on the defending side
 *  directly (via defenderIds, not targetUnitId) so no positional check drops it and no stay-in-fight
 *  prompt appears. A 1-on-1 fight needs no damage-allocation prompt, so it resolves synchronously. */
export function fightUnits(state: GameState, a: UnitState, b: UnitState): void {
  if (!a || !b || a.id === b.id) return
  startFight(state, {
    attackerId: a.id,
    isAttack: false,
    defenderIds: [b.id],
    targetStays: false,
    stage: 'strikeFirst',
    allocations: {},
    struck: [],
  })
}

/** resolve an undefended site strike (exported so replacement effects like
 *  Dame Britomart's can decline their option and strike after all) */
export function strikeSite(state: GameState, attackerId: string, siteId: string): void {
  const attacker = state.units[attackerId]
  const site = state.sites[siteId]
  if (!attacker || !site) return
  // site-strike bonuses (Boudicca: allies +3 while successfully attacking sites)
  let power = effAttack(state, attacker)
  for (const u of Object.values(state.units)) {
    const bonus = getScript(u.name)?.siteStrikeBonus
    if (bonus && !u.silenced) power += bonus(state, u.id, attacker)
  }
  dealDamage(state, { site: site.id }, power, attacker.controller, {
    player: attacker.controller,
    kind: 'strike',
    attackerId: attacker.id,
    name: attacker.name,
    undefended: true,
  })
  const script = getScript(attacker.name)
  if (script?.onStrikeSite && !attacker.silenced && state.sites[site.id]) {
    script.onStrikeSite(makeCtx(state, attacker.id, attacker.controller, []), site.id)
  }
  checkStateBased(state)
}

function fightSides(state: GameState, ctx: FightCtx): { attackers: UnitState[]; defenders: UnitState[] } {
  const attackers = [state.units[ctx.attackerId]].filter(Boolean) as UnitState[]
  const defenders: UnitState[] = []
  for (const id of ctx.defenderIds) {
    const u = state.units[id]
    if (u) defenders.push(u)
  }
  // simultaneous multi-target attacks (Karkemish Chimera): the extra targets
  // fight on the defending side
  const mt = state.flow?.multiTargets as { attackerId: string; ids: string[]; turn: number } | undefined
  if (mt && mt.attackerId === ctx.attackerId && mt.turn === state.turn) {
    const atk = attackers[0]
    for (const id of mt.ids) {
      const u = state.units[id]
      if (u && atk && !defenders.some((d) => d.id === id) && id !== ctx.targetUnitId &&
          occupiedSquares(atk).some((a) => occupies(u, a.x, a.y))) {
        defenders.push(u)
      }
    }
  }
  if (ctx.targetUnitId && (ctx.targetStays || ctx.defenderIds.length === 0)) {
    // a target that slipped away — or was already killed in the strike-first pass —
    // escapes the fight entirely (Wills-o'-the-Wisp's evasion; a strike-first
    // attacker felling its target). Guard it BEFORE dereferencing, or the normal
    // pass crashes on occupies(undefined) when a strike-first attacker kills first.
    const t = state.units[ctx.targetUnitId]
    const atk = attackers[0]
    if (t) {
      // either side may be oversized; cross-region digs (Putrid Presence) overlap
      const shares = !atk || occupiedSquares(atk).some((a) => occupies(t, a.x, a.y))
      const regionOk = !atk || atk.region === t.region ||
        (atk.region === 'surface' && (t.region === 'underground' || t.region === 'underwater'))
      if (shares && regionOk) defenders.push(t)
    }
  }
  return { attackers, defenders }
}

function strikesFirst(state: GameState, unit: UnitState): boolean {
  if (effKeywords(state, unit).strikeFirst) return true
  return hasUnbrokenLance(state, unit)
}

/** Evil Twin: "…and strikes first if THEY fight" — the twin gains strike-first
 *  ONLY in a fight whose opposing side contains the minion it copied, and never
 *  otherwise (owner ruling). Target-aware, so it can't live in effKeywords; and
 *  the name swap makes the twin's own script hooks unreachable, so the twin →
 *  original link lives in flow.evilTwins (set by the Evil Twin genesis). */
function evilTwinStrikesFirst(state: GameState, u: UnitState, opponents: UnitState[]): boolean {
  if (u.silenced) return false
  const link = ((state.flow?.evilTwins ?? []) as { twinId: string; originalId: string }[]).find((e) => e.twinId === u.id)
  if (!link) return false
  return opponents.some((o) => o.id === link.originalId)
}

function unbrokenLances(state: GameState, unit: UnitState): string[] {
  return unit.carrying.filter((id) => state.artifacts[id]?.name === 'Lance' && !(state.artifacts[id].counters?.broken))
}
function hasUnbrokenLance(state: GameState, unit: UnitState): boolean {
  return unbrokenLances(state, unit).length > 0
}

function fireAfterAttack(state: GameState, ctx: FightCtx): void {
  // the fight is over and damage allocated → combatants come to rest (an at-rest disabler may bite now)
  if (state.flow) state.flow.battleUnits = undefined
  if (!ctx.isAttack) return
  if (state.flow?.multiTargets?.attackerId === ctx.attackerId) delete state.flow.multiTargets
  const atk = state.units[ctx.attackerId]
  const after = atk ? getScript(atk.name)?.afterAttack : undefined
  if (atk && after && !atk.silenced) after(makeCtx(state, atk.id, atk.controller, []), atk, ctx.targetUnitId ?? null, ctx.siteId ?? null)
  // allies watching the attack resolve (Sir Agravaine)
  if (atk) {
    for (const ally of Object.values(state.units)) {
      if (ally.id === atk.id || ally.silenced || ally.controller !== atk.controller) continue
      const hook = getScript(ally.name)?.afterAllyAttack
      if (hook) hook(makeCtx(state, ally.id, ally.controller, []), atk, ctx.targetUnitId ?? null)
    }
  }
  // battle fully resolved (incl. afterAttack triggers + their deaths) → finalise the reveal
  checkStateBased(state)
  finishBattleCapture(state)
}

function runFightPass(state: GameState, ctx: FightCtx): void {
  const { attackers, defenders } = fightSides(state, ctx)
  // keep the live combatant set exempt from at-rest disables (intercepts / multi-targets that joined
  // this pass show up here too), so a Basilisk in the fight can't stop a combatant from striking
  state.flow = state.flow ?? {}
  state.flow.battleUnits = [...new Set([...(state.flow.battleUnits ?? []), ...attackers.map((u) => u.id), ...defenders.map((u) => u.id)])]
  // pre-death reference to the original attacker: an "attacks and kills" trigger (Sea Raider)
  // must still fire even if the attacker died in the same trade (FAQ), so we snapshot the live
  // object at the top of the pass rather than re-looking it up after deaths resolve.
  const attackerRef = state.units[ctx.attackerId]
  if (attackers.length === 0 || defenders.length === 0) {
    checkStateBased(state)
    if (ctx.stage === 'normal') fireAfterAttack(state, ctx)
    else { finishBattleCapture(state); if (state.flow) state.flow.battleUnits = undefined } // strikeFirst terminal: fireAfterAttack won't run here
    return
  }

  const pass = ctx.stage
  const roleOf = (u: UnitState) => (attackers.includes(u) ? 'attacking' : 'defending')
  const strikers = [...attackers, ...defenders].filter((u) => {
    if (ctx.struck.includes(u.id) || isDisabled(state, u)) return false
    // role-restricted strikers (Escyllion Cyclops doesn't strike back defending)
    const noStrike = getScript(u.name)?.noStrikeWhen
    if (noStrike && !u.silenced && noStrike === roleOf(u)) return false
    const sf = strikesFirst(state, u)
      || (getScript(u.name)?.strikesFirstWhen === roleOf(u) && !u.silenced)
      || evilTwinStrikesFirst(state, u, roleOf(u) === 'attacking' ? defenders : attackers)
    return pass === 'strikeFirst' ? sf : true
  })

  if (strikers.length === 0) {
    if (pass === 'strikeFirst') {
      ctx.stage = 'normal'
      runFightPass(state, ctx)
    } else {
      checkStateBased(state)
      fireAfterAttack(state, ctx)
    }
    return
  }

  // does any striker need a damage-allocation choice?
  for (const striker of strikers) {
    if (ctx.allocations[striker.id]) continue
    const enemySide = attackers.includes(striker) ? defenders : attackers
    const power = strikePower(state, striker)
    if (enemySide.length === 1 || power === 0) {
      ctx.allocations[striker.id] = { [enemySide[0].id]: power }
    } else {
      // controllers may split their unit's damage among the enemy as they wish
      pushPrompt(state, {
        player: striker.controller,
        kind: 'allocateDamage',
        title: `Divide ${striker.name}'s ${power} damage among the enemy`,
        data: { strikerId: striker.id, candidates: enemySide.map((u) => u.id), power },
        cont: 'combat:allocate',
        ctx,
      })
      return
    }
  }

  // all allocations known: strikes in this pass resolve simultaneously
  const blows: { striker: UnitState; target: UnitState; damage: number; lethal: boolean }[] = []
  for (const striker of strikers) {
    const split = ctx.allocations[striker.id]
    const lethal = !!effKeywords(state, striker).lethal
    const lethalVs = !striker.silenced ? getScript(striker.name)?.lethalVs : undefined
    // one-shot strike flags (Critical Strike double, Gift of the Raven lifelink)
    const flags: any[] = state.flow?.strikeFlags ?? []
    // ALL of the striker's pending flags apply to this strike and stack
    // multiplicatively (Critical Strike FAQ: doubling twice = ×4)
    const myFlags = flags.filter((f: any) => f.player === striker.controller)
    if (myFlags.length && state.flow) state.flow.strikeFlags = flags.filter((f: any) => f.player !== striker.controller)
    const doubles = myFlags.filter((f: any) => f.type === 'double').length
    // lifelink STACKS: each Gift of the Raven flag AND a passive strikeLifelink is its own source
    const lifelinkSources = myFlags.filter((f: any) => f.type === 'lifelink').length + ((getScript(striker.name)?.strikeLifelink && !striker.silenced) ? 1 : 0)
    for (const [targetId, dmg] of Object.entries(split)) {
      const target = state.units[targetId]
      if (!target) continue
      // A strike occurs whenever units fight — even at 0 power. The rulebook frames
      // striking as an action whose *result* is damage equal to power (which may be
      // 0), and "interact" lists "strikes" and "deals damage" separately. So the
      // strike and its triggers (onStrike/onSelfStruck/onAllyStrikesAvatar, lance
      // break, Stealth loss) fire regardless of damage; only the damage dealt is
      // conditional on being positive (see the blows loop below). This is what lets
      // a 0/0 Frog trigger Interrogator, or a 0-power strike destroy Phantasmal Shade.
      const dealt = dmg * 2 ** doubles
      blows.push({ striker, target, damage: dealt, lethal: lethal || !!lethalVs?.(state, striker, target) })
      // "whenever X strikes" per-blow hooks (Rowdy Boys)
      const strikeHook = !striker.silenced ? getScript(striker.name)?.onStrike : undefined
      if (strikeHook) strikeHook(makeCtx(state, striker.id, striker.controller, []), target)
      // carried artifacts watching their bearer's blows (The Rack)
      for (const artId of striker.carrying) {
        const art = state.artifacts[artId]
        const hook = art ? artScript(state, art)?.bearerOnStrike : undefined // silenced weapon doesn't fire
        if (art && hook) hook(makeCtx(state, art.id, striker.controller, []), art.id, target)
      }
      if (dealt > 0 && lifelinkSources > 0) {
        gainLife(state, striker.controller, dealt * lifelinkSources) // N sources → N× the heal
      }
    }
    {
      // every lance held adds +1 to the strike (see strikePower) and ALL of them break afterwards
      const lances = unbrokenLances(state, striker)
      if (lances.length) {
        for (const lanceId of lances) {
          striker.carrying = striker.carrying.filter((id) => id !== lanceId)
          delete state.artifacts[lanceId]
        }
        pushLog(state, striker.controller, `${striker.name}'s lance${lances.length > 1 ? 's' : ''} shatter${lances.length > 1 ? '' : 's'} after the blow.`)
      }
    }
    // striking (even at 0 power) "interacts with the realm" → this unit can't Drop this
    // turn. Marking every striker also covers an INTERCEPTED mover (it struck the
    // interceptor), so only a truly unintercepted move leaves a carrier free to drop.
    striker.interactedTurn = state.turn
    ctx.struck.push(striker.id)
  }
  // A warded unit absorbs an ENTIRE simultaneous strike pass (codex: "If a warded unit would
  // take damage from multiple sources simultaneously, all simultaneous damage is prevented and
  // the Ward breaks"). Rather than pre-breaking every warded target's ward from the RAW blow
  // damage, we let each blow's dealDamageToUnit decide AFTER its own damage modifiers run — so an
  // effect that reduces the blow to 0 (Tufted Turtles' shell, a fire immunity) spends itself and
  // LEAVES THE WARD INTACT, instead of the ward being wasted on a hit that deals no damage. The
  // shared `wardAbsorbed` set carries one break across the pass: the first blow that actually
  // lands breaks the ward, and every later simultaneous blow to that same target is prevented too.
  // serializable (survives a prevention-ordering prompt's cont / online sync); cleared after the pass
  state.flow = state.flow ?? {}
  state.flow.wardAbsorbed = []
  for (const blow of blows) {
    if (!state.units[blow.target.id]) continue // damage is simultaneous; unit map only loses entries after the pass
    // 0 damage "is not any damage at all" (rulebook) — the strike still happened (events below),
    // and damage modifiers may boost it (Panpipes of Pnom raises 0-power strikes to 2). We always
    // call dealDamageToUnit for strikes; it skips kill-credit/ward/actual damage when n stays ≤0
    // after modifiers, but it still runs the modifier layer so a booster can take effect.
    dealDamageToUnit(state, blow.target, blow.damage, blow.striker.controller, {
      lethal: blow.lethal && !blow.target.isAvatar,
      // batch: the strikes in this pass are simultaneous, so defer death resolution to the
      // single checkStateBased after the loop. Without this, an earlier blow's kill removes
      // a striker before a later (simultaneous) blow's damage modifiers can consult it — e.g.
      // in a trade Sirian Templar's "no damage from Undead" lost sight of the Undead that
      // died to Sirian's own strike, and Sirian wrongly took the fatal blow.
      batch: true,
      source: {
        player: blow.striker.controller,
        kind: 'strike',
        attackerId: blow.striker.id,
        name: blow.striker.name,
        undefended: ctx.isAttack === true && ctx.defenderIds.length === 0,
      },
    })
    if (blow.target.isAvatar) emitEvent(state, 'onAllyStrikesAvatar', blow.striker, blow.target)
    // "when this unit is struck" triggers (if it survived the blow)
    const survivor = state.units[blow.target.id]
    if (survivor) {
      const script = getScript(survivor.name)
      if (script?.onSelfStruck && !survivor.silenced) {
        script.onSelfStruck(makeCtx(state, survivor.id, survivor.controller, []), blow.striker)
      }
    }
  }
  delete state.flow.wardAbsorbed // the simultaneous pass is over — the shared ward-break ends here
  checkStateBased(state)
  if (state.phase === 'over') return

  // "has ever killed" bookkeeping + kill events for every fatal blow (the
  // victim object is the pre-death snapshot, position intact)
  for (const blow of blows) {
    if (state.units[blow.target.id]) continue // victim survived — not a kill
    // Kill triggers fire even on a TRADE: a minion that dies in the same fight it
    // scored a kill still triggers its "whenever this kills…" ability (rulebook:
    // simultaneous triggers resolve). So Stygian Archers summon their Skeleton even
    // as they fall. `blow.striker` is the pre-death snapshot (name/controller intact),
    // and onKill scripts read only ctx.controller — never the killer's live unit.
    const strikerAlive = !!state.units[blow.striker.id]
    // "has ever killed" bookkeeping + untap-on-kill boons only matter on a live striker.
    if (strikerAlive) blow.striker.counters = { ...blow.striker.counters, everKilled: 1 }
    const hook = !blow.striker.silenced ? getScript(blow.striker.name)?.onKill : undefined
    if (hook) hook(makeCtx(state, blow.striker.id, blow.striker.controller, []), blow.target)
    emitEvent(state, 'onUnitKilled', blow.target, blow.striker)
    // one-turn untap-on-kill boons (Warp Spasm)
    if (strikerAlive && (state.flow?.untapOnKill ?? []).some((e: any) => e.unitId === blow.striker.id && e.turn === state.turn)) {
      blow.striker.tapped = false
      pushLog(state, blow.striker.controller, `${blow.striker.name} surges on!`)
    }
  }

  // "attacks and kills" triggers for the original attacker (and its carried artifacts).
  // Gated on ctx.isAttack: an INTERCEPTION or a FIGHT is not an "attack" (Battlemage must not
  // draw when it intercepts-and-kills). Uses the pre-death attackerRef so a Sea Raider that
  // trades its life still resolves its ability in this death window.
  const attacker = attackerRef
  if (attacker && ctx.isAttack === true) {
    // "attacks and kills" counts EVERY enemy this attack felled and credited to the attacker — its
    // struck target(s) AND any collateral its weapon splashed (Flaming Sword), which arrives as
    // effect damage the bearer is credited for. Scope to enemies alive when the attack began, then
    // keep the ones now dead with the attacker in their kill credit (killerByVictim survives the
    // post-strike state-based settle; damageCredit does not). Falls back to the attacker's own
    // allocation when the snapshot is absent (non-openDefendWindow callers never reach here).
    const killerByVictim = (state.flow?.killerByVictim ?? {}) as Record<string, { id: string }[]>
    const pool = ctx.enemiesAtStart ?? Object.keys(ctx.allocations[attacker.id] ?? {})
    const kills = pool.filter((id) => !state.units[id] && (killerByVictim[id] ?? []).some((k) => k.id === attacker.id))
    const script = getScript(attacker.name)
    if (kills.length && script?.onAttackKill && !attacker.silenced) {
      for (const id of kills) {
        script.onAttackKill(makeCtx(state, attacker.id, attacker.controller, []), { id } as any)
      }
    }
    if (kills.length) {
      for (const artId of attacker.carrying) {
        const art = state.artifacts[artId]
        const hook = art ? artScript(state, art)?.onAttackKill : undefined // silenced weapon: no on-kill
        if (art && hook) for (const id of kills) hook(makeCtx(state, art.id, attacker.controller, []), { id } as any)
      }
    }
  }

  if (pass === 'strikeFirst') {
    ctx.stage = 'normal'
    runFightPass(state, ctx)
  } else {
    fireAfterAttack(state, ctx)
  }
}

/** strike damage including a carried lance's bonus and strike multipliers. A RANGED strike skips the
 *  lance bonus (a lance rewards charging into melee, not loosing an arrow) but still gets the strike
 *  multiplier (Grim Guisarme ×2 — a ranged strike is a strike). */
function strikePower(state: GameState, striker: UnitState, ranged = false): number {
  let n = effAttack(state, striker) + (ranged ? 0 : unbrokenLances(state, striker).length)
  for (const artId of striker.carrying) {
    const art = state.artifacts[artId]
    const mult = art ? artScript(state, art)?.bearerStrikeMultiplier : undefined // silenced → no multiplier
    if (mult) n *= mult
  }
  return n
}

registerCont('combat:allocate', (state, ctx: FightCtx, choice: { strikerId: string; allocation: Record<string, number> }) => {
  const striker = choice?.strikerId ? state.units[choice.strikerId] : null
  if (striker && choice.allocation && typeof choice.allocation === 'object') {
    const power = strikePower(state, striker)
    const clean: Record<string, number> = {}
    let total = 0
    for (const [targetId, raw] of Object.entries(choice.allocation)) {
      const n = Math.max(0, Math.floor(Number(raw) || 0))
      if (!state.units[targetId] || n === 0) continue
      clean[targetId] = (clean[targetId] ?? 0) + n
      total += n
    }
    if (total > power) {
      // trim overspend deterministically rather than rejecting mid-fight
      let excess = total - power
      for (const id of Object.keys(clean).reverse()) {
        const cut = Math.min(excess, clean[id])
        clean[id] -= cut
        excess -= cut
        if (clean[id] === 0) delete clean[id]
        if (excess === 0) break
      }
    }
    ctx.allocations[choice.strikerId] = clean
  }
  runFightPass(state, ctx)
})

// ---------- intercepting ----------

function offerIntercept(state: GameState, mover: UnitState): void {
  const enemyP = opponent(mover.controller)
  const mkw = effKeywords(state, mover)
  if (mover.stealth) return // can't be intercepted
  if (mover.region === 'surface' && interceptBlockedAt(state, mover.x, mover.y)) return // Blizzard etc.
  // Blaze: the burning runner can't be intercepted this turn
  if ((state.flow?.noIntercept ?? []).some((e: any) => e.unitId === mover.id && e.turn === state.turn)) return
  const candidates = unitsAt(state, mover.x, mover.y, mover.region).filter((u) => {
    if (u.controller !== enemyP) return false
    if (!canTap(state, u) || isDisabled(state, u)) return false
    if (getScript(u.name)?.cantIntercept && !u.silenced) return false
    if (mkw.airborne) {
      const ukw = effKeywords(state, u)
      if (!ukw.airborne && !ukw.ranged) return false
    }
    return true
  })
  if (candidates.length === 0) return
  pushPrompt(state, {
    player: enemyP,
    kind: 'intercept',
    title: `${mover.name} stops at ${squareLabel(mover.x, mover.y)}. Intercept?`,
    data: { candidates: candidates.map((u) => u.id), moverId: mover.id },
    cont: 'combat:intercept',
    ctx: { moverId: mover.id },
  })
}

registerCont('combat:intercept', (state, ctx: { moverId: string }, choice: string | null) => {
  if (!choice) return
  const mover = state.units[ctx.moverId]
  const interceptor = state.units[choice]
  if (!mover || !interceptor) return
  if (interceptor.controller === mover.controller || !canTap(state, interceptor) || isDisabled(state, interceptor)) return
  if (interceptor.x !== mover.x || interceptor.y !== mover.y || interceptor.region !== mover.region) return
  tapUnit(state, interceptor)
  pushLog(state, interceptor.controller, `${interceptor.name} intercepts ${mover.name}!`)
  const ctx2: FightCtx = {
    attackerId: interceptor.id,
    targetUnitId: mover.id,
    defenderIds: [],
    targetStays: true,
    stage: 'strikeFirst',
    allocations: {},
    struck: [],
  }
  runFightPass(state, ctx2)
  // offer further intercepts while the mover survives
  const m = state.units[ctx.moverId]
  if (m) offerIntercept(state, m)
})

// ---------- projectiles (Ranged) ----------

export type Direction = 'n' | 's' | 'e' | 'w'

/** A projectile fired by a UNIT'S OWN ability (Sparkmage, Flamecaller, Colicky
 *  Dragonettes…) counts as damage that unit deals, so the shooter's Lethal keyword
 *  — e.g. from a carried Poisonous Dagger — makes it lethal. A SPELL projectile
 *  does NOT (its source card is a Magic, not the unit): the bearer merely casts it.
 *  The shooter is the spec's `excludeId` (the caster/bearer, never hit by its shot). */
function projectileShotIsLethal(state: GameState, excludeId: string | undefined, srcName: string, target: UnitState): boolean {
  if (target.isAvatar || !excludeId) return false
  const shooter = state.units[excludeId]
  if (!shooter) return false
  if (findCard(srcName)?.type === 'Magic') return false // a spell, not the unit acting
  return !!effKeywords(state, shooter).lethal
}

/** resolve a ranged projectile striking ONE chosen unit — normal strike rules
 *  (Lance bonus etc.), kill bookkeeping, onKill / afterRangedStrike hooks. */
function resolveProjectileHit(state: GameState, shooterId: string, targetId: string): void {
  const shooter = state.units[shooterId]
  const target = state.units[targetId]
  if (!shooter || !target) return
  pushLog(state, shooter.controller, `${shooter.name} shoots ${target.name}.`)
  const snapshot = { ...target }
  const kw = effKeywords(state, shooter)
  // a ranged strike IS a strike: it uses strike power (so a carried Grim Guisarme ×2 applies — the
  // shooter "deals double"), and is tagged rangedStrike so strike-damage modifiers (the same Guisarme
  // when the VICTIM wears it) double it too.
  dealDamageToUnit(state, target, strikePower(state, shooter, true), shooter.controller, {
    lethal: !!kw.lethal && !target.isAvatar,
    source: { player: shooter.controller, kind: 'projectile', rangedStrike: true, attackerId: shooter.id, name: shooter.name },
  })
  checkStateBased(state)
  if (!state.units[snapshot.id]) {
    // Kill triggers fire even if the shooter died simultaneously (rulebook:
    // simultaneous triggers resolve) — a dying Stygian Archer still summons its
    // Skeleton. everKilled bookkeeping only applies to a still-living shooter.
    const shooter2 = state.units[shooterId]
    if (shooter2) shooter2.counters = { ...shooter2.counters, everKilled: 1 }
    const killHook = !shooter.silenced ? getScript(shooter.name)?.onKill : undefined
    if (killHook) killHook(makeCtx(state, shooterId, shooter.controller, []), snapshot as UnitState)
    emitEvent(state, 'onUnitKilled', snapshot, shooter2 ?? shooter)
  }
  const s = state.units[shooterId]
  const after = s ? getScript(s.name)?.afterRangedStrike : undefined
  if (s && after && !s.silenced) after(makeCtx(state, s.id, s.controller, []), s)
}

// rulebook (Projectiles): "In the event of multiple valid units, the player that
// fired the projectile chooses which unit the projectile hits."
registerCont('projectile:hit', (state, ctx: { shooterId: string }, choice) => {
  const targetId = Array.isArray(choice) ? choice[0] : choice
  if (typeof targetId === 'string') resolveProjectileHit(state, ctx.shooterId, targetId)
})

// an oversized/stretched shooter picked which of its squares the Ranged shot flies from → fire it there
registerCont('ranged:origin', (state, ctx: { unitId: string; player: PlayerId; dir: Direction }, choice) => {
  const sq = choice as any
  if (sq && typeof sq.x === 'number' && typeof sq.y === 'number') shootProjectile(state, ctx.player, ctx.unitId, ctx.dir, { x: sq.x, y: sq.y })
})

export function shootProjectile(state: GameState, player: PlayerId, unitId: string, direction: Direction, origin?: { x: number; y: number }, opts?: { skipTapCheck?: boolean }): string | null {
  const unit = state.units[unitId]
  if (!unit) return 'No such unit.'
  if (unit.controller !== player) return 'Not your unit.'
  const kw = effKeywords(state, unit)
  if (!kw.ranged) return `${unit.name} has no Ranged ability.`
  if (isDisabled(state, unit)) return `${unit.name} is disabled.`
  // skipTapCheck: a bonus ranged strike taken DURING a Move (Skirmishers of Mu) — the unit already
  // tapped to move, so it neither re-checks nor re-taps; it just looses the shot.
  if (!opts?.skipTapCheck) {
    if (!canTap(state, unit)) return unit.tapped ? `${unit.name} is already tapped.` : `${unit.name} has summoning sickness.`
    tapUnit(state, unit)
  }
  breakStealth(state, unit)
  // both-player reveal: golden shooter + "<card> shoots!" over its (glowing) site (like a cast).
  beginAreaReveal(state, undefined, unit.name, unitId, false)
  markRevealShoots(state)
  sealAbilityReveal(state, `${unit.name} shoots!`)

  // an oversized/stretched shooter fires from a CHOSEN occupied square (origin); the unit itself stays put
  const ox = origin?.x ?? unit.x
  const oy = origin?.y ?? unit.y
  const dx = direction === 'e' ? 1 : direction === 'w' ? -1 : 0
  const dy = direction === 'n' ? 1 : direction === 's' ? -1 : 0
  // Truesight Crossbow: the bearer sees through Stealth
  const truesight = unit.carrying.some((id) => getScript(state.artifacts[id]?.name ?? '')?.bearerTruesight)
  const hittable = (u: UnitState) => projectileCanHit(state, u) || (truesight && u.stealth)
  // resolve the impact: one hittable unit → resolve now; 2+ → the SHOOTER chooses
  // which is hit (rulebook Projectiles), never an engine auto-pick.
  const impact = (here: UnitState[]) => {
    if (here.length === 1) resolveProjectileHit(state, unitId, here[0].id)
    else pushPrompt(state, {
      player,
      kind: 'chooseTargets',
      title: `${unit.name}'s shot — which unit does it hit?`,
      data: { candidates: here.map((u) => u.id), count: 1, kind: 'unit' },
      cont: 'projectile:hit',
      ctx: { shooterId: unitId },
    })
  }
  // the shot begins at the shooter's OWN square: enemies sharing it are hit first
  // (allies at the starting location are ignored per the rulebook; not the shooter)
  {
    const atOrigin = unitsAt(state, ox, oy, unit.region).filter((u) => u.id !== unitId && u.controller !== player && hittable(u))
    if (atOrigin.length > 0) { impact(atOrigin); return null }
  }
  // Magellan Globe: a Ranged shot flies around the joined edge (same region), exactly like a spell
  // projectile's raySquares — wrap the coords on leaving the board, and a `visited` guard stops the
  // ray if it circles all the way back. Without a Globe it breaks at the edge as before.
  const wrap = edgesConnected(state)
  const visited = new Set<string>([`${ox},${oy}`])
  let x = ox
  let y = oy
  for (let step = 1; step <= (kw.ranged ?? 1); step++) {
    x += dx
    y += dy
    if (!inBounds(x, y)) {
      if (!wrap) break
      x = ((x % GRID_W) + GRID_W) % GRID_W
      y = ((y % GRID_H) + GRID_H) % GRID_H
    }
    if (visited.has(`${x},${y}`)) break // wrapped all the way around the realm → stop
    // Impenetrable Copse: projectiles can't enter from outside
    const cover = Object.values(state.sites).find((s) => s.x === x && s.y === y && !s.isRubble)
    if (cover && getScript(cover.name)?.blocksProjectiles && !siteSilencedC(state, cover)) break
    // Sir Morien: enemy projectiles can't enter his square — but only in the projectile's own region
    // ("here" = his location), so a surface blocker doesn't stop a subsurface shot and vice-versa
    if (unitsAt(state, x, y, unit.region).some((u) => !u.silenced && u.controller !== player && getScript(u.name)?.unitBlocksProjectiles)) break
    visited.add(`${x},${y}`)
    const here = unitsAt(state, x, y, unit.region).filter(hittable)
    if (here.length > 0) { impact(here); return null }
  }
  pushLog(state, player, `${unit.name}'s shot hits nothing.`)
  return null
}

// ---------- spell / effect projectiles (shooter chooses the target) ----------
//
// Projectiles fired by spells, artifacts and activated abilities (NOT the Ranged
// keyword) travel in a straight cardinal line with INFINITE range by default — a
// card may cap it — and strike the first location holding a unit they can hit.
// Per the rulebook, when several valid units share that location the SHOOTER
// chooses which one is hit, so these must PROMPT, never auto-pick. Volleys are
// fired one at a time (a kill clears the lane for the next projectile).

export type ProjFilterKind = 'canHit' | 'notStealth'

/** A projectile counts as MAGIC when its source card is a Magic (Firebolts, Magic Missiles, Fireball,
 *  Ice Lance…). A unit/artifact/ability shot (Ranged strikes, Sparkmage, Balor's gaze, Meat Hook…) is
 *  NOT magic. A magic-protected minion (Failed Mutation) BLOCKS a magic projectile at its square —
 *  absorbing the shot, taking no damage, and stopping anything beyond from being hit (magicBlockedAt) —
 *  while remaining an ordinary target for non-magic shots. */
function projSrcIsMagic(srcName?: string): boolean {
  return !!srcName && findCard(srcName)?.type === 'Magic'
}

function projHittable(kind: ProjFilterKind, state: GameState, u: UnitState): boolean {
  return kind === 'notStealth' ? !u.stealth : projectileCanHit(state, u)
}

/** squares along a cardinal ray from (x,y) in travel order (origin excluded). The
 *  projectile travels within its own `region` and STOPS at the edge of that region:
 *  a void square (no site) has no surface/subsurface, so the ray ends there and
 *  does NOT cross it (rulebook: "…until it reaches the edge of its region"). */
function raySquares(state: GameState, region: Region, x: number, y: number, dir: string, maxRange: number, player?: PlayerId): { x: number; y: number }[] {
  const dx = dir === 'e' ? 1 : dir === 'w' ? -1 : 0
  const dy = dir === 'n' ? 1 : dir === 's' ? -1 : 0
  const wrap = edgesConnected(state) // Magellan Globe: projectiles fly around the edge (same region)
  const out: { x: number; y: number }[] = []
  const visited = new Set<string>([`${x},${y}`]) // includes the origin: a wrapped ray stops on return
  let cx = x, cy = y
  for (let i = 0; i < maxRange; i++) {
    cx += dx; cy += dy
    if (!inBounds(cx, cy)) {
      if (!wrap) break
      cx = ((cx % GRID_W) + GRID_W) % GRID_W
      cy = ((cy % GRID_H) + GRID_H) % GRID_H
    }
    if (visited.has(`${cx},${cy}`)) break // wrapped all the way around the realm → stop
    if (!regionPresentAt(state, region, cx, cy)) break // hit the void → edge of the region
    // Impenetrable Copse: projectiles can't enter a blocking site from outside — the ray
    // stops BEFORE it (so units on/behind the cover are unreachable). Same rule the Ranged
    // path (shootProjectile) already applied; spell/effect projectiles honor it now too.
    const cover = state.sites ? Object.values(state.sites).find((s) => s.x === cx && s.y === cy && !s.isRubble) : undefined
    if (cover && getScript(cover.name)?.blocksProjectiles && !siteSilencedC(state, cover)) break
    // Sir Morien: enemy projectiles can't enter his square — only in the projectile's own region ("here")
    if (player !== undefined && unitsAt(state, cx, cy, region).some((u) => !u.silenced && u.controller !== player && getScript(u.name)?.unitBlocksProjectiles)) break
    visited.add(`${cx},${cy}`)
    out.push({ x: cx, y: cy })
  }
  return out
}

/** A projectile's flight begins at the shooter's OWN square, then travels the ray
 *  (rulebook: "the path includes their starting location and any additional
 *  locations"). So enemies sharing the caster's square are the first thing hit.
 *  `player` (the shooter) lets the ray honor enemy-only blockers (Sir Morien). */
function projectilePath(state: GameState, region: Region, ox: number, oy: number, dir: string, maxRange: number, player?: PlayerId): { x: number; y: number; origin: boolean }[] {
  return [{ x: ox, y: oy, origin: true }, ...raySquares(state, region, ox, oy, dir, maxRange, player).map((s) => ({ x: s.x, y: s.y, origin: false }))]
}

/** hittable candidate unit ids at one path square. At the ORIGIN (the caster's
 *  square) allies are IGNORED per the rulebook ("ignoring any allies at the
 *  projectile's starting location") and the caster itself is always excluded, so
 *  only ENEMIES there are valid; elsewhere any hittable unit is a candidate. */
function projCandidates(
  state: GameState,
  sq: { x: number; y: number; origin: boolean },
  region: Region,
  player: PlayerId,
  filter: ProjFilterKind,
  excludeId?: string,
  avatarImmune?: boolean,
  excludeIds?: string[],
): string[] {
  let here = unitsAt(state, sq.x, sq.y, region).filter((u) => u.id !== excludeId && !excludeIds?.includes(u.id) && projHittable(filter, state, u))
  if (sq.origin) here = here.filter((u) => u.controller !== player)
  if (avatarImmune) here = here.filter((u) => !u.isAvatar)
  return here.map((u) => u.id)
}

/** Does a magic-protected minion (Failed Mutation) occupy this square and BLOCK a magic projectile?
 *  It absorbs the shot — no damage, and nothing at or beyond this square is hit. Mirrors projCandidates'
 *  origin rule (allies at the caster's own square are ignored; the caster never blocks its own shot). */
function magicBlockedAt(state: GameState, sq: { x: number; y: number; origin: boolean }, region: Region, player: PlayerId, excludeId?: string): boolean {
  let here = unitsAt(state, sq.x, sq.y, region).filter((u) => u.id !== excludeId && isMagicProtected(state, u))
  if (sq.origin) here = here.filter((u) => u.controller !== player)
  return here.length > 0
}

/** serializable — rides the choice prompt so the volley loop resumes after it */
export interface VolleyProjectileSpec {
  player: PlayerId
  ox: number
  oy: number
  region: Region
  dir: string
  volleys: number
  damage: number
  /** per projectile; omit / Infinity = whole board (default for spells) */
  maxRange?: number
  filter?: ProjFilterKind
  /** the caster / bearer, never hit by its own shot */
  excludeId?: string
  srcName: string
}

/** Fire `volleys` damage projectiles from (ox,oy), one at a time. Each strikes the
 *  first location with a hittable unit; when >1 share it the shooter is prompted.
 *  Deals `damage` to the chosen unit. Public entry: call from a card's onCast/cont. */
export function fireVolleyProjectiles(state: GameState, spec: VolleyProjectileSpec): void {
  if (spec.volleys <= 0) return
  markRevealShoots(state) // an ability firing this reads "<card> shoots!" (ignored for spells)
  const range = spec.maxRange ?? Infinity
  const filter = spec.filter ?? 'canHit'
  const srcMagic = projSrcIsMagic(spec.srcName)
  for (const sq of projectilePath(state, spec.region, spec.ox, spec.oy, spec.dir, range, spec.player)) {
    // a magic-protected body (Failed Mutation) absorbs a magic projectile here — no damage, shot spent,
    // nothing beyond is hit; this projectile ends and the next volley (if any) fires.
    if (srcMagic && magicBlockedAt(state, sq, spec.region, spec.player, spec.excludeId)) {
      pushLog(state, spec.player, `${spec.srcName} fizzles against a magic-immune minion.`)
      return fireVolleyProjectiles(state, { ...spec, volleys: spec.volleys - 1 })
    }
    const here = projCandidates(state, sq, spec.region, spec.player, filter, spec.excludeId)
    if (here.length === 0) continue
    if (here.length === 1) return applyVolleyHit(state, spec, here[0])
    // 2+ share the impact square → the shooter chooses which is hit (rulebook)
    pushPrompt(state, {
      player: spec.player,
      kind: 'chooseTargets',
      title: `${spec.srcName} — which unit does the projectile hit?`,
      data: { candidates: here, count: 1, kind: 'unit' },
      cont: 'spell-proj:volley',
      ctx: spec as any,
    })
    return
  }
  // flew off the board without hitting anything → next volley
  if (spec.volleys > 1) fireVolleyProjectiles(state, { ...spec, volleys: spec.volleys - 1 })
}

function applyVolleyHit(state: GameState, spec: VolleyProjectileSpec, targetId: string): void {
  const u = state.units[targetId]
  if (u) {
    recordAreaReveal(state, [{ x: u.x, y: u.y, dmg: spec.damage }]) // both-player grid reveal
    dealDamageToUnit(state, u, spec.damage, spec.player, {
      lethal: projectileShotIsLethal(state, spec.excludeId, spec.srcName, u),
      source: { player: spec.player, kind: 'effect', name: spec.srcName },
    })
    checkStateBased(state)
  }
  if (spec.volleys > 1) fireVolleyProjectiles(state, { ...spec, volleys: spec.volleys - 1 })
}

registerCont('spell-proj:volley', (state, spec: VolleyProjectileSpec, choice) => {
  const id = Array.isArray(choice) ? choice[0] : choice
  applyVolleyHit(state, spec, typeof id === 'string' ? id : '')
})

/** For projectiles whose effect ISN'T plain damage (teleport, banish, bounce…):
 *  return the hittable units at the first impact location, or null if the shot
 *  flies off empty. The card then applies its own effect — resolving a single
 *  candidate immediately, or prompting the shooter (chooseTargets) when >1. */
export function firstProjectileImpact(
  state: GameState,
  opts: { player: PlayerId; ox: number; oy: number; region: Region; dir: string; maxRange?: number; filter?: ProjFilterKind; excludeId?: string; avatarImmune?: boolean; excludeIds?: string[] },
): { candidates: string[] } | null {
  markRevealShoots(state) // ability shooters read "<card> shoots!" (ignored for spells)
  const filter = opts.filter ?? 'canHit'
  for (const sq of projectilePath(state, opts.region, opts.ox, opts.oy, opts.dir, opts.maxRange ?? Infinity, opts.player)) {
    const here = projCandidates(state, sq, opts.region, opts.player, filter, opts.excludeId, opts.avatarImmune, opts.excludeIds)
    if (here.length > 0) return { candidates: here }
  }
  return null
}

// piercing/per-location projectiles (Ice Lance 3/2/1 over the first N squares;
// Balor 2 at every square): hit up to ONE unit at each square, shooter-chosen.
export interface PerSquareProjectileSpec {
  player: PlayerId
  ox: number
  oy: number
  region: Region
  dir: string
  /** damage per square in travel order; length also caps how many squares are hit */
  damages: number[]
  idx?: number
  filter?: ProjFilterKind
  excludeId?: string
  srcName: string
  /** include the shooter's OWN square (the caster's site) as the first location, per the
   *  rulebook projectile path. Default false — most gaze/ray effects (Balor) skip it. */
  includeOrigin?: boolean
}

/** Fire a projectile that hits one unit at each of `damages.length` squares along
 *  the ray, dealing damages[i] at square i. Prompts the shooter per square when
 *  several units share it. */
export function firePerSquareProjectile(state: GameState, spec: PerSquareProjectileSpec): void {
  markRevealShoots(state) // ability shooters read "<card> shoots!" (ignored for spells)
  const filter = spec.filter ?? 'canHit'
  // Ice Lance-style projectiles (includeOrigin) begin on the shooter's OWN square — the
  // caster's site — per the rulebook ("the path includes their starting location"); allies
  // + the caster there are ignored (projCandidates), so a co-located enemy is pierced first.
  // Balor-style gazes leave includeOrigin unset and start one square along the direction.
  const path = spec.includeOrigin
    ? projectilePath(state, spec.region, spec.ox, spec.oy, spec.dir, spec.damages.length - 1, spec.player)
    : raySquares(state, spec.region, spec.ox, spec.oy, spec.dir, spec.damages.length, spec.player).map((s) => ({ x: s.x, y: s.y, origin: false }))
  const srcMagic = projSrcIsMagic(spec.srcName)
  for (let i = spec.idx ?? 0; i < path.length && i < spec.damages.length; i++) {
    if (srcMagic && magicBlockedAt(state, path[i], spec.region, spec.player, spec.excludeId)) {
      pushLog(state, spec.player, `${spec.srcName} fizzles against a magic-immune minion.`)
      return // the piercing shot is stopped dead by the blocker
    }
    const here = projCandidates(state, path[i], spec.region, spec.player, filter, spec.excludeId)
    if (here.length === 0) continue
    if (here.length === 1) {
      applyPerSquareHit(state, spec, i, here[0])
      continue
    }
    pushPrompt(state, {
      player: spec.player,
      kind: 'chooseTargets',
      title: `${spec.srcName} — which unit does the projectile hit here?`,
      data: { candidates: here, count: 1, kind: 'unit' },
      cont: 'spell-proj:perSquare',
      ctx: { ...spec, idx: i } as any,
    })
    return
  }
}

function applyPerSquareHit(state: GameState, spec: PerSquareProjectileSpec, i: number, targetId: string): void {
  const u = state.units[targetId]
  if (u) {
    recordAreaReveal(state, [{ x: u.x, y: u.y, dmg: spec.damages[i] }]) // both-player grid reveal
    dealDamageToUnit(state, u, spec.damages[i], spec.player, {
      lethal: projectileShotIsLethal(state, spec.excludeId, spec.srcName, u),
      source: { player: spec.player, kind: 'effect', name: spec.srcName },
    })
    checkStateBased(state)
  }
}

registerCont('spell-proj:perSquare', (state, spec: PerSquareProjectileSpec, choice) => {
  const id = Array.isArray(choice) ? choice[0] : choice
  const i = spec.idx ?? 0
  if (typeof id === 'string') applyPerSquareHit(state, spec, i, id)
  firePerSquareProjectile(state, { ...spec, idx: i + 1 })
})

// Balor's Evil Eye: "2 damage to one unit at EACH other LOCATION in a cardinal direction."
// A location is one region in one square (rulebook), so — unlike a region-bounded projectile —
// the gaze reaches EVERY square in the direction (it does not stop at the void) and hits one unit
// at each region-location it finds: surface AND subsurface of every site, AND the void (FAQ:
// "one unit at each location in every square… surface and subsurface of sites, as well as the void").
export interface EvilEyeGazeSpec {
  player: PlayerId
  ox: number
  oy: number
  dir: string
  damage: number
  maxRange?: number
  filter?: ProjFilterKind
  excludeId?: string
  srcName: string
  /** computed once from the board, then carried across per-location choice prompts */
  locations?: { x: number; y: number; region: Region }[]
  idx?: number
}

/** the ordered list of (square, region) locations a gaze touches: every square from the origin
 *  outward in `dir`, and at each the regions actually present there (surface + subsurface, or void). */
function gazeLocations(state: GameState, spec: EvilEyeGazeSpec): { x: number; y: number; region: Region }[] {
  const dx = spec.dir === 'e' ? 1 : spec.dir === 'w' ? -1 : 0
  const dy = spec.dir === 'n' ? 1 : spec.dir === 's' ? -1 : 0
  const max = spec.maxRange ?? Infinity
  // Magellan Globe: the gaze is a directional line, so it wraps around the joined edge (a `visited`
  // guard stops it once it circles back — essential since maxRange may be Infinity). No Globe → it
  // stops at the board edge as before.
  const wrap = edgesConnected(state)
  const out: { x: number; y: number; region: Region }[] = []
  const visited = new Set<string>([`${spec.ox},${spec.oy}`])
  let cx = spec.ox, cy = spec.oy
  for (let step = 0; step < max; step++) {
    cx += dx; cy += dy
    if (!inBounds(cx, cy)) {
      if (!wrap) break
      cx = ((cx % GRID_W) + GRID_W) % GRID_W
      cy = ((cy % GRID_H) + GRID_H) % GRID_H
    }
    if (visited.has(`${cx},${cy}`)) break // wrapped all the way around → stop
    visited.add(`${cx},${cy}`)
    for (const region of ['surface', 'underground', 'underwater', 'void'] as Region[]) {
      if (regionPresentAt(state, region, cx, cy)) out.push({ x: cx, y: cy, region })
    }
  }
  return out
}

export function fireEvilEyeGaze(state: GameState, spec: EvilEyeGazeSpec): void {
  const filter = spec.filter ?? 'notStealth'
  const locations = spec.locations ?? gazeLocations(state, spec)
  for (let i = spec.idx ?? 0; i < locations.length; i++) {
    const loc = locations[i]
    const here = unitsAt(state, loc.x, loc.y, loc.region)
      .filter((u) => u.id !== spec.excludeId && projHittable(filter, state, u))
      .map((u) => u.id)
    if (here.length === 0) continue
    if (here.length === 1) { applyGazeHit(state, spec, loc, here[0]); continue }
    // 2+ units share this location → the controller chooses which one the Eye burns
    pushPrompt(state, {
      player: spec.player,
      kind: 'chooseTargets',
      title: `${spec.srcName} — which unit does the Evil Eye burn here?`,
      data: { candidates: here, count: 1, kind: 'unit' },
      cont: 'spell-proj:evilEye',
      ctx: { ...spec, locations, idx: i } as any,
    })
    return
  }
}

function applyGazeHit(state: GameState, spec: EvilEyeGazeSpec, loc: { x: number; y: number; region: Region }, targetId: string): void {
  const u = state.units[targetId]
  if (!u) return
  if (projSrcIsMagic(spec.srcName) && isMagicProtected(state, u)) return // a magic gaze can't damage a protected unit
  recordAreaReveal(state, [{ x: loc.x, y: loc.y, dmg: spec.damage }])
  dealDamageToUnit(state, u, spec.damage, spec.player, {
    lethal: projectileShotIsLethal(state, spec.excludeId, spec.srcName, u),
    source: { player: spec.player, kind: 'effect', name: spec.srcName },
  })
  checkStateBased(state)
}

registerCont('spell-proj:evilEye', (state, spec: EvilEyeGazeSpec, choice) => {
  const id = Array.isArray(choice) ? choice[0] : choice
  const i = spec.idx ?? 0
  if (typeof id === 'string' && spec.locations) applyGazeHit(state, spec, spec.locations[i], id)
  fireEvilEyeGaze(state, { ...spec, idx: i + 1 })
})

// A piercing projectile that passes through EVERY location on its path (Heat Ray),
// dealing a constant `damage` to ONE unit at each (shooter-chosen when several
// share a square). Unlike firePerSquareProjectile it uses the full origin-aware
// path (projCandidates ignores allies at the caster's own square) and runs the
// path's whole dynamic length, stopping at the void / board edge.
export interface PiercingProjectileSpec {
  player: PlayerId
  ox: number
  oy: number
  region: Region
  dir: string
  /** constant damage dealt at each location */
  damage: number
  /** omit / Infinity = whole board (default for spells) */
  maxRange?: number
  filter?: ProjFilterKind
  excludeId?: string
  avatarImmune?: boolean
  srcName: string
  /** resume cursor along the path */
  pathIdx?: number
}

export function firePiercingProjectile(state: GameState, spec: PiercingProjectileSpec): void {
  const filter = spec.filter ?? 'canHit'
  const srcMagic = projSrcIsMagic(spec.srcName)
  const path = projectilePath(state, spec.region, spec.ox, spec.oy, spec.dir, spec.maxRange ?? Infinity, spec.player)
  for (let i = spec.pathIdx ?? 0; i < path.length; i++) {
    if (srcMagic && magicBlockedAt(state, path[i], spec.region, spec.player, spec.excludeId)) {
      pushLog(state, spec.player, `${spec.srcName} fizzles against a magic-immune minion.`)
      return // the piercing ray is stopped dead by the blocker
    }
    const here = projCandidates(state, path[i], spec.region, spec.player, filter, spec.excludeId, spec.avatarImmune)
    if (here.length === 0) continue
    if (here.length === 1) { applyPiercingHit(state, spec, here[0]); continue }
    // 2+ share this location → the shooter chooses which one the ray burns here
    pushPrompt(state, {
      player: spec.player,
      kind: 'chooseTargets',
      title: `${spec.srcName} — which unit does the projectile hit here?`,
      data: { candidates: here, count: 1, kind: 'unit' },
      cont: 'spell-proj:pierce',
      ctx: { ...spec, pathIdx: i } as any,
    })
    return
  }
}

function applyPiercingHit(state: GameState, spec: PiercingProjectileSpec, targetId: string): void {
  const u = state.units[targetId]
  if (u) {
    recordAreaReveal(state, [{ x: u.x, y: u.y, dmg: spec.damage }]) // both-player grid reveal
    dealDamageToUnit(state, u, spec.damage, spec.player, {
      lethal: projectileShotIsLethal(state, spec.excludeId, spec.srcName, u),
      source: { player: spec.player, kind: 'effect', name: spec.srcName },
    })
    checkStateBased(state)
  }
}

registerCont('spell-proj:pierce', (state, spec: PiercingProjectileSpec, choice) => {
  const id = Array.isArray(choice) ? choice[0] : choice
  if (typeof id === 'string') applyPiercingHit(state, spec, id)
  // resume at the NEXT location (recomputing the path — geometry is terrain-stable)
  firePiercingProjectile(state, { ...spec, pathIdx: (spec.pathIdx ?? 0) + 1 })
})

// ---------- pick up / drop ----------

export function pickUp(state: GameState, player: PlayerId, unitId: string, artifactIds: string[], unitIds: string[] = []): string | null {
  const unit = state.units[unitId]
  if (!unit || unit.controller !== player) return 'Not your unit.'
  if (isDisabled(state, unit)) return `${unit.name} is disabled.`
  if ((unit.usedThisTurn['pickup'] ?? 0) >= 1) return 'Pick Up was already used this turn.'
  // Red Rock of Ravannis: artifacts can't be carried at its location
  if (Object.values(state.artifacts).some((a) => !a.carriedBy && a.x === unit.x && a.y === unit.y && artScript(state, a)?.blocksCarryingHere)) {
    return 'A strange magnetism prevents carrying artifacts here.'
  }
  const stealsCarried = getScript(unit.name)?.stealsCarried
  for (const id of artifactIds) {
    const art = state.artifacts[id]
    if (!art) return 'That artifact cannot be picked up.'
    // Monuments AND Automatons are immovable — they can never be picked up or carried (rulebook).
    // isCarriableArtifact is the single source of truth (excludes both subtypes).
    if (!isCarriableArtifact(art.name)) return `${art.name} can't be carried.`
    if (art.carriedBy) {
      // Thieving Magpie: may lift artifacts out of others' hands
      const holder = state.units[art.carriedBy]
      if (!stealsCarried || !holder || unit.silenced || !stealsCarried(state, unit, art)) return 'That artifact cannot be picked up.'
      if (holder.x !== unit.x || holder.y !== unit.y || holder.region !== unit.region) return 'The artifact is not at your location.'
      continue
    }
    if (art.x !== unit.x || art.y !== unit.y || art.region !== unit.region) return 'The artifact is not at your location.'
  }
  if (unitIds.length > 0) {
    const err = pickUpUnits(state, player, unit, unitIds)
    if (err) return err
  }
  for (const id of artifactIds) {
    const art = state.artifacts[id]!
    if (art.carriedBy) {
      const holder = state.units[art.carriedBy]
      if (holder) holder.carrying = holder.carrying.filter((a) => a !== id)
      pushLog(state, player, `${unit.name} snatches ${art.name} from ${holder?.name ?? 'its holder'}!`)
    } else {
      pushLog(state, player, `${unit.name} picks up ${art.name}.`)
    }
    art.carriedBy = unit.id
    art.x = unit.x
    art.y = unit.y
    art.region = unit.region
    unit.carrying.push(id)
    // "when picked up" triggers (13 Treasures of Britain)
    const hook = artScript(state, art)?.onPickedUp // a silenced artifact has no pick-up trigger
    if (hook) hook(makeCtx(state, art.id, player, []), unit)
  }
  unit.usedThisTurn['pickup'] = 1
  return null
}

export function drop(state: GameState, player: PlayerId, unitId: string, artifactIds: string[], unitIds: string[] = []): string | null {
  const unit = state.units[unitId]
  if (!unit || unit.controller !== player) return 'Not your unit.'
  if (getScript(unit.name)?.unitCantDrop && !unit.silenced && artifactIds.length > 0) return `${unit.name} refuses to let go.`
  if ((unit.usedThisTurn['drop'] ?? 0) >= 1) return 'Drop was already used this turn.'
  // Drop basic ability: only a unit that HASN'T interacted with the realm this turn may
  // drop (rulebook — "if this unit hasn't interacted with the realm, it may drop…").
  // Moving unintercepted doesn't interact; attacking / firing / casting / activating does.
  if (unit.interactedTurn === state.turn) return `${unit.name} has interacted with the realm this turn and can't drop.`
  for (const id of artifactIds) {
    if (!unit.carrying.includes(id)) return 'Not carrying that artifact.'
    const art = state.artifacts[id]
    if (art && artScript(state, art)?.cantDrop) return `${art.name} cannot be dropped.` // silenced → droppable
  }
  // Cursed Iron: artifacts on covered squares can't be dropped
  if (artifactIds.length > 0) {
    for (const r of Object.values(state.auras)) {
      if (getScript(r.name)?.aurasPreventDrop && r.squares.some((s) => s.x === unit.x && s.y === unit.y)) {
        return 'The cursed iron clings to its bearer.'
      }
    }
  }
  if (unitIds.length > 0) {
    const err = dropUnits(state, player, unit, unitIds)
    if (err) return err
  }
  for (const id of artifactIds) {
    const art = state.artifacts[id]!
    art.carriedBy = null
    art.x = unit.x
    art.y = unit.y
    art.region = unit.region
    unit.carrying = unit.carrying.filter((a) => a !== id)
    pushLog(state, player, `${unit.name} drops ${art.name}.`)
  }
  unit.usedThisTurn['drop'] = 1
  return null
}
