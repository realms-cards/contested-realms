import { getCard } from '../cards/db'
import { getScript, type AbilityDef, type EffectAPI } from '../cards/scripts/registry'
import type { Action, ActionResult, GameState, PlayerId, UnitState } from './types'
import { doMulligan, keepHand } from './setup'
import { endTurn } from './turn'
import { activePrompt, resolvePrompt, pushLog, pushPrompt, registerCont, drawCards, opponent, makeCtx, checkStateBased, killUnit, tapUnit, checkWard, luckyCandidates, bumpManaSpent, beginAreaReveal, sealAbilityReveal, revealAbility, setActionCredit, restoreActionCredit, reconcileSummonTax, completeDeferredDeaths, finishBattleCapture, runDamageEvent } from './effects'
import { castSpell, playSite, affinity, validateTarget, legalTargetOptions, sameTargetRef, resolvePendingCast } from './casting'
import { moveAttack, shootProjectile, pickUp, drop, enforceForcedAttacks, resolvePendingMoveAttack } from './combat'
import { applyJudge } from './judge'
import { abilityAnchor, avatarOf, unitsAt, nearbySquaresW, occupiedSquares } from './grid'
import { canTap, isDisabled, effKeywords, siteSilenced, artifactSilenced, artScript, grantedAbilities, attackBlockedAt } from './statics'
import { reachableLocations } from './movement'

export { createGame } from './setup'

/**
 * Apply a player's action to the game state (mutates it). Returns ok/error.
 * Every legal mutation bumps state.version so clients can sync.
 */
export function applyAction(state: GameState, player: PlayerId, action: Action): ActionResult {
  const err = dispatch(state, player, action)
  if (err) return { ok: false, error: err }
  // once the action (and any effect chain) has fully settled, reckon the batch of Mock-Court summon
  // taxes together — pay for all if affordable, else prompt which to keep (see reconcileSummonTax)
  // Finalize any death that was deferred while its (async) deathrite resolved — the striker lingered in
  // the realm until its rite finished; now that the queue is clear, it leaves.
  if (state.prompts.length === 0) completeDeferredDeaths(state)
  // A battle whose reveal was deferred (a mid-battle prompt — prevention ordering, Bodyguard redirect —
  // kept it open) is now over: finalise the "Battle of X" panel from the settled board.
  if (state.prompts.length === 0) finishBattleCapture(state)
  // A cast parked behind the Enchantress's animate-an-aura prompt now resolves — after the animate
  // fully resolved, so the freshly-animated aura minion is present for the spell (Death Dealer, etc.).
  if (state.prompts.length === 0) resolvePendingCast(state)
  if (state.prompts.length === 0) reconcileSummonTax(state)
  // Resume a Move & Attack whose attack was parked while an entry trigger (Sold-out Cemetery, …)
  // resolved — the attack's target is declared/re-validated only now that all movement has settled.
  if (state.prompts.length === 0) resolvePendingMoveAttack(state)
  // The Green Knight: proactively compel any enemy minion that can now attack it (at turn start and
  // after every action). Runs only when no prompt is open; it may open its own (order / defend) prompt.
  if (state.prompts.length === 0) enforceForcedAttacks(state)
  // a card effect may force the turn to end (e.g. Candlemas Monks' deathrite)
  if (state.flow?.endPhaseNow && state.phase === 'main' && state.prompts.length === 0) {
    state.flow.endPhaseNow = false
    endTurn(state)
  }
  state.version++
  return { ok: true }
}

/** Courtesan Thaïs: the seat that makes a given seat's decisions right now */
export function actingSeatFor(state: GameState, decisionSeat: PlayerId): PlayerId {
  const ctrl = state.flow?.thaisActive
  if (ctrl !== undefined && ctrl === decisionSeat && state.activePlayer === ctrl) return opponent(ctrl)
  return decisionSeat
}

/** Courtesan Thaïs: which seat's BOARD a given client should see. While a seat's
 *  turn is controlled by the other, BOTH players look at the controlled (active)
 *  player's board — the CONTROLLER so they can pilot that hand (their view flips to
 *  it), the controlled player just watching their own turn played for them. Online,
 *  the server sends each seat `viewFor(viewSeatFor(seat))`, which reveals the
 *  controlled hand to its pilot for the duration and reverts when control ends.
 *  Act-permission stays keyed on the real socket seat via actingSeatFor. */
export function viewSeatFor(state: GameState, seat: PlayerId): PlayerId {
  const ctrl = state.flow?.thaisActive
  if (ctrl !== undefined && ctrl === state.activePlayer) return ctrl
  return seat
}

function dispatch(state: GameState, player: PlayerId, action: Action): string | null {
  if (state.phase === 'over' && action.t !== 'prompt') return 'The game is over.'

  // Courtesy: gift time to your OPPONENT's chess clock. A meta-action allowed at any time
  // (like concede), never routed through Thaïs. You can only add to the OTHER seat.
  if (action.t === 'addTime') {
    if (!state.clock) return 'This game has no clock.'
    if (action.player === player) return 'You can only add time to your opponent.'
    const ms = Math.max(0, Math.min(Math.round(action.ms), 3_600_000)) // cap a single gift at 1h
    state.clock.remaining[action.player] = Math.max(0, state.clock.remaining[action.player] + ms)
    pushLog(state, player, `${state.players[player].name} grants ${state.players[action.player].name} +${Math.round(ms / 1000)}s.`)
    return null
  }

  // Courtesan Thaïs: during a controlled turn, the opponent makes the active
  // player's decisions (concede always stays with its own seat)
  if (state.flow?.thaisActive !== undefined && state.flow.thaisActive === state.activePlayer && action.t !== 'concede') {
    if (action.t === 'prompt') {
      const pr = state.prompts[0]
      if (pr && pr.player === state.flow.thaisActive) {
        if (player === state.flow.thaisActive) return "Thaïs's bargain: your opponent decides for you this turn."
        if (player === opponent(state.flow.thaisActive)) player = state.flow.thaisActive
      }
    } else {
      if (player === state.flow.thaisActive) return "Thaïs's bargain: your opponent plays this turn for you."
      if (player === opponent(state.flow.thaisActive)) player = state.flow.thaisActive
    }
  }

  if (action.t === 'concede') {
    state.winner = opponent(player)
    state.phase = 'over'
    pushLog(state, player, `${state.players[player].name} concedes.`)
    return null
  }

  if (action.t === 'prompt') {
    return resolvePrompt(state, action.promptId, player, action.choice)
  }

  // a pending prompt blocks all other actions
  const prompt = activePrompt(state)
  if (prompt) return `Waiting for ${state.players[prompt.player].name}: ${prompt.title}`

  if (action.t === 'mulligan') return doMulligan(state, player, action.back)
  if (action.t === 'keepHand') return keepHand(state, player)

  // judge tools work for either player at any time (manual card resolution)
  if (action.t === 'judge') return applyJudge(state, player, action.op)

  // ---- "wait, I forgot!" interjection ----
  if (action.t === 'requestInterject') {
    if (state.interject) return 'An interjection is already in progress.'
    if (state.phase !== 'main') return 'Interjections happen during the main phase.'
    if (state.activePlayer === player) return 'It IS your turn.'
    // the requester must have completed at least one turn of their own
    const hadATurn = state.turn >= 3 || (state.turn === 2 && player === state.firstPlayer)
    if (!hadATurn) return "You haven't played a turn yet."
    pushPrompt(state, {
      player: state.activePlayer,
      kind: 'yesNo',
      title: `✋ ${state.players[player].name} forgot something and asks to interject. Allow it?`,
      data: {},
      cont: 'interject:ask',
      ctx: { player },
    })
    return null
  }
  if (action.t === 'endInterject') {
    if (!state.interject || state.interject.player !== player) return 'No interjection to end.'
    state.activePlayer = state.interject.prevActive
    state.interject = null
    pushLog(state, player, `${state.players[player].name} is done — the turn resumes.`)
    return null
  }

  // during an interjection every action by the interjector needs approval
  if (
    state.interject &&
    player === state.interject.player &&
    !state.flow?.interjectApproved &&
    (action as Action).t !== 'concede'
  ) {
    if (action.t === 'endTurn') return 'End your interjection instead.'
    pushPrompt(state, {
      player: state.interject.prevActive,
      kind: 'yesNo',
      title: `Approve ${state.players[player].name}'s action: ${describeAction(state, action)}?`,
      data: {},
      cont: 'interject:approve',
      ctx: { action, player },
    })
    return null
  }

  // everything below requires it to be your main phase (interjections swap activePlayer)
  if (state.phase !== 'main') return 'You can only act during your main phase.'
  if (state.activePlayer !== player) return 'It is not your turn.'
  if (state.interject && player === state.interject.player && action.t === 'endTurn') return 'End your interjection instead.'

  switch (action.t) {
    case 'endTurn': {
      const blocked = mustAttackViolation(state, player)
      if (blocked) return blocked
      endTurn(state)
      return null
    }
    case 'avatarSite': {
      const avatar = avatarOf(state, player)
      if (getScript(avatar.name)?.noStandardSiteAction) return `${avatar.name} plays sites through its own ability.`
      if (!canTap(state, avatar)) return 'Your Avatar is already tapped.'
      tapUnit(state, avatar)
      if (action.mode === 'draw') {
        if (getScript(avatar.name)?.noAtlasDraw) {
          avatar.tapped = false
          return `${avatar.name} has no atlas to draw from.`
        }
        drawCards(state, player, 'atlas')
        revealAbility(state, avatar.id, `${avatar.name} draws a site`) // golden avatar + writing over its site
        return null
      }
      const siteNm = state.cards[action.cardId]?.name ?? 'a site'
      const err = playSite(state, player, action.cardId, action.x, action.y)
      if (err) {
        avatar.tapped = false // refund the tap on an illegal placement
        return err
      }
      state.players[player].established = true // the avatar now has a domain (gates the void rule)
      revealAbility(state, avatar.id, `${avatar.name} plays ${siteNm}`, { x: action.x, y: action.y }) // golden avatar + writing over the played site
      // avatar riders on the site play (Geomancer's rubble-fill)
      const after = getScript(avatar.name)?.afterAvatarSitePlay
      if (after && !avatar.silenced) {
        const played = Object.values(state.sites).find((s) => s.cardId === action.cardId)
        if (played) after(makeCtx(state, avatar.id, player, []), played.id)
      }
      return null
    }
    case 'castSpell':
      return castSpell(state, player, action.cardId, action.casterId, action.at, action.targets, action.extra)
    case 'moveAttack':
      return moveAttack(state, player, action.unitId, action.path, action.attack)
    case 'pickUp':
      return pickUp(state, player, action.unitId, action.artifactIds, action.unitIds ?? [])
    case 'drop':
      return drop(state, player, action.unitId, action.artifactIds, action.unitIds ?? [])
    case 'activate':
      return activateAbility(state, player, action)
    default:
      return 'Unknown action.'
  }
}

/** short human description of an action for approval prompts */
/** forced attacks (Mask of Mayhem, Tvinnax Berserker): the turn can't end while
 *  a compelled, able minion has an attack available */
function mustAttackViolation(state: GameState, player: PlayerId): string | null {
  const compelled = (u: UnitState): boolean => {
    if (getScript(u.name)?.mustAttackSelf && !u.silenced) return true
    // NB: The Green Knight's "enemies must attack me" is enforced PROACTIVELY (enforceForcedAttacks) — an
    // able enemy is compelled to attack it immediately, so it never lingers as an end-turn violation here.
    return Object.values(state.artifacts).some((a) => {
      if (!artScript(state, a)?.forcesNearbyAttacks) return false // silenced artifact compels nothing
      const ax = a.carriedBy ? state.units[a.carriedBy]?.x : a.x
      const ay = a.carriedBy ? state.units[a.carriedBy]?.y : a.y
      return ax !== undefined && ay !== undefined && nearbySquaresW(state, ax, ay).some((s) => s.x === u.x && s.y === u.y)
    })
  }
  for (const u of Object.values(state.units)) {
    if (u.controller !== player || u.isAvatar || u.tapped) continue
    if (!canTap(state, u) || isDisabled(state, u) || !compelled(u)) continue
    const spots = [{ x: u.x, y: u.y, region: u.region }, ...reachableLocations(state, u)]
    for (const s of spots) {
      const prey = unitsAt(state, s.x, s.y, s.region).some(
        (o) => o.controller !== player && !o.stealth && !attackBlockedAt(state, o.x, o.y),
      )
      if (prey) return `${u.name} is compelled to attack before the turn can end.`
    }
  }
  return null
}

function describeAction(state: GameState, action: Action): string {
  switch (action.t) {
    case 'castSpell':
      return `cast ${state.cards[action.cardId]?.name ?? 'a spell'}`
    case 'moveAttack': {
      const u = state.units[action.unitId]
      const target = action.attack && 'unit' in action.attack ? state.units[action.attack.unit]?.name : action.attack && 'site' in action.attack ? state.sites[action.attack.site]?.name : null
      return `${u?.name ?? 'a unit'} moves${target ? ` and attacks ${target}` : ''}`
    }
    case 'avatarSite':
      return action.mode === 'draw' ? 'draw a site' : `play ${state.cards[action.cardId]?.name ?? 'a site'}`
    case 'activate':
      return `activate ${state.units[action.sourceId]?.name ?? state.sites[action.sourceId]?.name ?? state.artifacts[action.sourceId]?.name ?? 'an ability'}`
    case 'pickUp':
      return 'pick something up'
    case 'drop':
      return 'drop something'
    case 'judge':
      return 'a judge adjustment'
    default:
      return action.t
  }
}

registerCont('interject:ask', (state, ctx: { player: PlayerId }, choice) => {
  if (!choice) {
    pushLog(state, ctx.player, 'The interjection is declined.')
    return
  }
  state.interject = { player: ctx.player, prevActive: state.activePlayer }
  state.activePlayer = ctx.player
  pushLog(state, ctx.player, `✋ ${state.players[ctx.player].name} interjects! (each action needs approval; no start phase)`)
})

registerCont('interject:approve', (state, ctx: { action: Action; player: PlayerId }, choice) => {
  if (!choice) {
    pushLog(state, ctx.player, 'Action declined.')
    return
  }
  state.flow = state.flow ?? {}
  state.flow.interjectApproved = true
  const err = dispatch(state, ctx.player, ctx.action)
  state.flow.interjectApproved = false
  if (err) pushLog(state, ctx.player, `Interjected action failed: ${err}`)
})

/** Check every precondition for activating an ability (source ownership, disabled/
 *  silenced, oncePerTurn, mana, threshold, tap/life costs) WITHOUT paying costs or
 *  resolving effects. Returns null when the ability can be activated, or a human-
 *  readable reason string when it cannot. Does NOT validate targets.
 *
 *  This is the single source of truth for client button disabled-state: all three
 *  action panels (unitActions, siteActions, artifactActions) call this so gating
 *  logic never drifts from the engine. */
/** True when `action` activates an ability flagged `tentativePlay` (Animist's "cast a magic as a
 *  Spirit"). The online server holds such an activation TENTATIVELY — only the actor sees it — and
 *  records/broadcasts it to the opponent only if the flow actually casts something. */
export function isTentativeActivate(state: GameState, action: Action): boolean {
  if (action.t !== 'activate') return false
  const src = state.units[action.sourceId] ?? state.sites[action.sourceId] ?? state.artifacts[action.sourceId]
  if (!src) return false
  const unit = state.units[action.sourceId]
  const ability = getScript(src.name)?.abilities?.find((a) => a.key === action.ability)
    ?? (unit ? grantedAbilities(state, unit).find((a) => a.key === action.ability) : undefined)
  return !!ability?.tentativePlay
}

/** The one-shot "spring" ability of a face-down site TRAP, synthesized from the real card's
 *  `siteTrapAbility`. Activating it reveals the true site (name ← real, `trap` cleared, so its real
 *  threshold/passives/abilities come online) and fires the trap's effect. Surfaced with the SITE as
 *  source (sourceId = siteId) so it anchors at the site and the reveal glows there; the client's
 *  siteActions offers it while the owner still holds the secret. Returns undefined if not a trap. */
function trapSpringAbility(state: GameState, siteId: string): AbilityDef | undefined {
  const realName = state.sites[siteId]?.trap?.realName
  const ta = realName ? getScript(realName)?.siteTrapAbility : undefined
  if (!realName || !ta) return undefined
  return {
    key: 'trap:spring',
    label: ta.label,
    cost: ta.cost,
    threshold: ta.threshold,
    targets: ta.targets,
    effect: (ctx: EffectAPI) => {
      const s = ctx.state.sites[siteId]
      if (s?.trap?.realName) { s.name = s.trap.realName; delete s.trap } // reveal: it is now its real self
      ta.effect(ctx)
    },
  }
}

export function canActivate(
  state: GameState,
  player: PlayerId,
  sourceId: string,
  abilityKey: string,
): string | null {
  const source = state.units[sourceId] ?? state.sites[sourceId] ?? state.artifacts[sourceId]
  if (!source) return 'No such card.'
  const script = getScript(source.name)
  const unit = state.units[sourceId]
  let ability = script?.abilities?.find((a) => a.key === abilityKey)
  if (!ability && unit) {
    ability = grantedAbilities(state, unit).find((a) => a.key === abilityKey)
  }
  if (!ability && abilityKey === 'trap:spring' && state.sites[sourceId]?.trap) ability = trapSpringAbility(state, sourceId)
  if (!ability) return `${source.name} has no such ability.`
  // context-gated abilities (Realm-Eater's Digest only with a meal to digest)
  if (ability.available && !ability.available(state, sourceId)) return `${source.name} can't use that right now.`

  if (unit) {
    if (unit.controller !== player) return 'Not your unit.'
    if (isDisabled(state, unit)) return `${unit.name} is disabled.`
    if (unit.silenced) return `${unit.name} is silenced.`
  } else {
    const controller = state.sites[sourceId]?.controller ?? state.artifacts[sourceId]?.conjuredBy
    if (controller !== player) return 'You do not control that.'
    const site = state.sites[sourceId]
    if (site && siteSilenced(state, site)) return `${site.name} is silenced.`
    const art = state.artifacts[sourceId]
    if (art && artifactSilenced(state, art)) return `${art.name} is silenced.` // Acid Rain hushes artifacts too
  }

  const p = state.players[player]
  if (ability.oncePerTurn && unit && (unit.usedThisTurn[ability.key] ?? 0) >= 1) return 'Already used this turn.'
  if (ability.oncePerTurn && !unit && state.flow?.abilityUsed?.[`${sourceId}:${ability.key}`] === state.turn)
    return 'Already used this turn.'
  if (ability.cost.mana && p.mana < ability.cost.mana) return 'Not enough mana.'
  if (ability.threshold) {
    const have = affinity(state, player)
    for (const el of ['air', 'earth', 'fire', 'water'] as const) {
      if ((ability.threshold[el] ?? 0) > have[el]) return 'Elemental threshold not met.'
    }
  }
  if (ability.cost.tap) {
    if (unit) {
      if (!canTap(state, unit)) return unit.tapped ? 'Already tapped.' : 'Summoning sickness.'
    } else if (state.artifacts[sourceId]) {
      if (state.artifacts[sourceId].tapped) return 'Already tapped.'
    } else if (state.flow?.abilityUsed?.[`${sourceId}:${ability.key}`] === state.turn) {
      // sites do NOT tap — a "tap" cost on a site is a once-per-turn gate instead
      return 'Already used this turn.'
    }
  }
  if (ability.cost.life) {
    const avatar = avatarOf(state, player)
    if ((avatar.life ?? 0) < ability.cost.life) return 'Not enough life.'
  }
  return null
}

function activateAbility(
  state: GameState,
  player: PlayerId,
  action: Extract<Action, { t: 'activate' }>,
): string | null {
  // built-in: Ranged projectile
  if (action.ability === 'ranged') {
    const dir = action.extra?.direction
    if (!['n', 's', 'e', 'w'].includes(dir)) return 'Choose a direction.'
    // an oversized / Rack-stretched shooter occupies several squares → it picks which one the shot flies from
    const shooter = state.units[action.sourceId]
    if (shooter && action.extra?.origin === undefined) {
      const squares = occupiedSquares(shooter)
      if (squares.length > 1) {
        pushPrompt(state, { player, kind: 'chooseSquare', title: `${shooter.name} shoots from which square?`, data: { squares }, cont: 'ranged:origin', ctx: { unitId: action.sourceId, player, dir } })
        return null
      }
    }
    return shootProjectile(state, player, action.sourceId, dir, action.extra?.origin)
  }

  // scripted abilities on units, sites, artifacts
  const source = state.units[action.sourceId] ?? state.sites[action.sourceId] ?? state.artifacts[action.sourceId]
  if (!source) return 'No such card.'
  const script = getScript(source.name)
  let ability = script?.abilities?.find((a) => a.key === action.ability)
  if (!ability && state.units[action.sourceId]) {
    // abilities granted by artifacts/auras/sites (Battering Ram, Homecoming...)
    ability = grantedAbilities(state, state.units[action.sourceId]).find((a) => a.key === action.ability)
  }
  if (!ability && action.ability === 'trap:spring' && state.sites[action.sourceId]?.trap) ability = trapSpringAbility(state, action.sourceId)
  if (!ability) return `${source.name} has no such ability.`

  // precondition check (controller, disabled, silenced, costs) — single source of truth
  const preErr = canActivate(state, player, action.sourceId, action.ability)
  if (preErr) return preErr

  const unit = state.units[action.sourceId]
  const p = state.players[player]

  // validate targets
  const targets = (action.targets ?? []).map((r) =>
    r.startsWith('sq:')
      ? { square: { x: Number(r.slice(3).split(',')[0]), y: Number(r.slice(3).split(',')[1]), region: r.slice(3).split(',')[2] as any } }
      : r.startsWith('u')
        ? { unit: r }
        : r.startsWith('s')
          ? { site: r }
          : r.startsWith('r')
            ? { aura: r }
            : { artifact: r },
  )
  // Anchor target validation on the ability's SOURCE (unit itself, a carried
  // artifact's bearer, or a positional pseudo-caster at a site/ground-artifact's
  // square) so `where:`/`targeted:` ranges and `spec.filter` see the source's
  // location — not the avatar's. See grid.ts abilityAnchor.
  // Anchor target validation on the ability's SOURCE (unit itself, a carried
  // artifact's bearer, or a positional pseudo-caster at a site/ground-artifact's
  // square) so `where:`/`targeted:` ranges and `spec.filter` see the source's
  // location — not the avatar's. See grid.ts abilityAnchor.
  const caster = abilityAnchor(state, action.sourceId, player)
  let ti = 0
  const abilitySpecs = ability.targets ?? []
  for (let si = 0; si < abilitySpecs.length; si++) {
    const spec = abilitySpecs[si]
    for (let i = 0; i < spec.count && ti < targets.length; i++, ti++) {
      const err = validateTarget(state, spec, targets[ti] as any, caster, player)
      if (err) return err
      // engine-authoritative legal set for spatial/interdependent ability picks (Midland Army's
      // bombard, Corpse Catapult's fling — "up to three steps away") — reject a too-far pick up front
      // so the tap/discard cost isn't spent on a shot that would just fizzle out of range.
      const opts = legalTargetOptions(state, script, caster, targets.slice(0, ti) as any, si)
      if (opts && !opts.some((o) => sameTargetRef(o, targets[ti] as any))) return 'Not a legal target.'
    }
    if (!spec.upTo && ti < spec.count) return 'Missing targets.'
  }

  // pay costs
  if (ability.cost.tap) {
    if (unit) tapUnit(state, unit)
    else if (state.artifacts[action.sourceId]) state.artifacts[action.sourceId].tapped = true
    // sites do NOT tap; a tap-cost site ability is gated once-per-turn (recorded below)
  }
  if (ability.cost.mana) { p.mana -= ability.cost.mana; bumpManaSpent(state, player, ability.cost.mana) }
  if (ability.cost.life) {
    const avatar = avatarOf(state, player)
    avatar.life = Math.max(0, (avatar.life ?? 0) - ability.cost.life)
  }
  // `deferUse` abilities don't spend their once-per-turn at activation — the script marks it only when the
  // effect actually COMMITS (e.g. Deathspeaker on the summon), so backing out of intermediate prompts is free.
  if (unit && ability.oncePerTurn && !ability.deferUse) unit.usedThisTurn[ability.key] = 1
  // activating a special ability "interacts with the realm" (Codex — Stealth) → the unit can't
  // Drop this turn AND loses its Stealth token (Far East Assassin is revealed when it throws an
  // artifact — FAQ: "it's an activated special ability, so Stealth is lost per the normal Stealth
  // rules"). Same shape as a spell cast (casting.ts). Avatars have no Stealth, so this only bites
  // minions. The `ranged` built-in returns earlier and breaks Stealth inside shootProjectile.
  if (unit) {
    unit.interactedTurn = state.turn
    // The avatar spent its Tap on a non-site special ability (Sorcerer's "Draw a spell", …) instead of
    // developing — a site play taps WITHOUT setting this. The bot's eval penalises it while developing
    // (see eval.ts avatarTapWaste). Pathfinders (noStandardSiteAction) develop via their own ability, so
    // they're never flagged. Keyed to state.turn so it's self-expiring (no per-turn reset needed).
    if (unit.isAvatar && ability.cost.tap && getScript(unit.name)?.noStandardSiteAction !== true) {
      state.flow = state.flow ?? {}
      state.flow.avatarTapAbility = state.flow.avatarTapAbility ?? {}
      state.flow.avatarTapAbility[player] = state.turn
    }
    if (unit.stealth) {
      unit.stealth = false
      pushLog(state, player, `${unit.name} loses Stealth.`)
    }
  }
  // sites record once-per-turn for either an explicit oncePerTurn OR a tap cost
  // (their tap can't be tracked on the card, since sites don't tap)
  if (!unit && (ability.oncePerTurn || (ability.cost.tap && state.sites[action.sourceId]))) {
    state.flow = state.flow ?? {}
    state.flow.abilityUsed = state.flow.abilityUsed ?? {}
    state.flow.abilityUsed[`${action.sourceId}:${ability.key}`] = state.turn
  }

  pushLog(state, player, `${source.name}: ${ability.label}.`)
  // codex: an opponent's ability targeting breaks wards instead
  {
    let wi = 0
    for (const spec of ability.targets ?? []) {
      for (let i = 0; i < spec.count && wi < targets.length; i++, wi++) {
        if (!spec.targeted) continue
        const ref = targets[wi] as any
        if (ref && 'unit' in ref) {
          const tu = state.units[ref.unit]
          if (tu && checkWard(state, tu, player, tu.controller, 'target')) {
            pushLog(state, player, `${tu.name}'s ward breaks — the ability cannot touch it.`)
            targets[wi] = { unit: '__warded__' } as any
          }
        } else if (ref && 'site' in ref) {
          const ts = state.sites[ref.site]
          if (ts && checkWard(state, ts, player, ts.controller, 'target')) {
            pushLog(state, player, `${ts.name}'s ward breaks — the ability cannot touch it.`)
            targets[wi] = { site: '__warded__' } as any
          }
        }
      }
    }
  }
  // fresh area-damage reveal capture for this ability (Sparkmage, …): the source unit/artifact
  // is the "caster" (golden glow); its name captions the numbered grid.
  const abilitySrc = state.units[action.sourceId] ?? state.artifacts[action.sourceId]
  beginAreaReveal(state, undefined, abilitySrc?.name, action.sourceId)
  const abilityCtx = makeCtx(state, action.sourceId, player, targets as any, action.at, action.extra)
  if (ability.contOwner) {
    // cross-script grants (Pallid Bust, Vivien, Salmon of Knowledge): asks/lucky
    // resolve on the ORIGIN script's conts, not the granted-to unit's
    const origin = ability.contOwner
    abilityCtx.ask = (prompt, contKey, ctx) => {
      pushPrompt(state, {
        player: prompt.player ?? player,
        kind: prompt.kind,
        title: prompt.title,
        data: prompt.data ?? {},
        cont: `script:${origin}:${contKey}`,
        ctx: { sourceId: action.sourceId, controller: player, targets, at: action.at, extra: action.extra, ...ctx },
      })
    }
    abilityCtx.lucky = (options, contKey, display = 'options', ctxExtra = {}) => {
      const r = luckyCandidates(state, player, options)
      if (!r.choose) return r.payload
      pushPrompt(state, {
        player: r.chooser,
        kind: display === 'cards' ? 'chooseCards' : 'chooseOption',
        title: r.chooser === player ? 'Lucky Charm: choose an outcome' : 'Determine the outcome',
        data: display === 'cards' ? { cards: r.options.map((o) => o.label), pick: 1, upTo: false } : { options: r.options.map((o) => o.label) },
        cont: `script:${origin}:${contKey}`,
        ctx: { sourceId: action.sourceId, controller: player, targets, at: action.at, extra: action.extra, ...ctxExtra, __opts: r.options.map((o) => o.payload), __labels: r.options.map((o) => o.label) },
      })
      return undefined
    }
  }
  // kill credit (priority 3): the unit activating the ability gets credit for kills it causes
  // (incl. no-damage kills — Asmodeus destroying a minion). For an ARTIFACT ability, credit the
  // bearer (rulebook: tapping to pay = activating the artifact's ability).
  const creditUnit = state.units[action.sourceId] ? action.sourceId : (state.artifacts[action.sourceId]?.carriedBy ?? undefined)
  const prevCredit = setActionCredit(state, 3, creditUnit ? [creditUnit] : [])
  // one simultaneous damage event: an area-damage ability (Doomsday Device, Corpse Explosion) resolves
  // every victim's reduction/prevention before a single death settles (see runDamageEvent).
  runDamageEvent(state, () => ability.effect(abilityCtx))
  if (ability.cost.sacrificeSelf && unit) {
    // a sacrifice is a forced self-kill that bypasses "can't be destroyed" (The Doom of Dilmun)
    state.flow = state.flow ?? {}
    const prevSac = state.flow.sacrificing
    state.flow.sacrificing = unit.id
    killUnit(state, unit.id)
    state.flow.sacrificing = prevSac
  }
  checkStateBased(state)
  restoreActionCredit(state, prevCredit)
  // Animate the ability like a spell cast (golden caster + writing + site glow), shown to BOTH
  // players. Base caption is "<card>'s ability"; a projectile ability reads "<card> shoots!".
  const cardNm = abilitySrc?.name ?? source.name // for a sprung trap, source.name is now the revealed real name
  const caption = action.ability === 'trap:spring'
    ? `trap activates: ${cardNm}`
    : state.flow?.areaReveal?.shoots ? `${cardNm} shoots!` : `${cardNm}'s ability`
  sealAbilityReveal(state, caption)
  return null
}
