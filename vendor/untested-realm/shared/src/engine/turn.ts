import { getScript } from '../cards/scripts/registry'
import { getCard } from '../cards/db'
import type { GameState, PlayerId } from './types'
import { pushLog, pushPrompt, registerCont, drawCards, opponent, makeCtx, checkStateBased, killUnit, deferTurnStep, tapUnit, noAtlasDrawChoice, recordManaGain, siteStillFlooded, beginAreaReveal, sealAbilityReveal, snapshotRealm, recordTouchedSites, turnFingerprint } from './effects'
import { sitesOf, unitsOf, avatarOf, siteAt } from './grid'
import { siteSilenced, artifactSilenced, siteDisabledByArtifact, canTap, isDisabled } from './statics'
import { playSite } from './casting'

export function beginTurn(state: GameState, player: PlayerId): void {
  // skipped turns pass straight to the opponent (Vaults of Zul)
  if (state.flow?.skipTurn?.[player]) {
    state.flow.skipTurn[player] = 0
    pushLog(state, player, `${state.players[player].name}'s turn is skipped!`)
    return beginTurn(state, opponent(player))
  }
  state.turn += 1
  state.activePlayer = player
  state.phase = 'start'
  const p = state.players[player]
  pushLog(state, player, `— Turn ${state.turn}: ${p.name} —`)

  // Minion damage is removed in the end phase (rulebook), but an end-of-turn effect
  // that resolves through a prompt can deal its damage AFTER that heal. Clear any
  // such straggler damage at the start of this (the opponent's) turn so it never
  // leaks across the turn boundary. Normally a no-op — no minion carries damage here.
  for (const unit of Object.values(state.units)) {
    if (!unit.isAvatar && unit.damage) unit.damage = 0
  }

  // Courtesan Thaïs: each affected player's next turn is played by the other
  if (state.flow?.thaisActive !== undefined) delete state.flow.thaisActive
  if (state.flow?.thaisPending?.includes(player)) {
    state.flow.thaisPending = state.flow.thaisPending.filter((q: PlayerId) => q !== player)
    if (!state.flow.thaisPending.length) delete state.flow.thaisPending
    state.flow.thaisActive = player
    pushLog(state, player, `💋 Thaïs's bargain: ${state.players[opponent(player)].name} plays this turn for ${p.name}!`)
  }

  // "until next turn" effects of this player end
  for (const unit of Object.values(state.units)) {
    unit.modifiers = unit.modifiers.filter(
      (m) => !(m.duration === 'untilYourNextTurn' && m.sourcePlayer === player && m.turn < state.turn),
    )
  }
  // named-spell seals expire at the start of the sealer's next turn (Hyter Sprites)
  if (state.flow?.castBans) {
    state.flow.castBans = state.flow.castBans.filter(
      (b: { player: PlayerId; turn: number }) => !(b.player === player && b.turn < state.turn),
    )
  }
  // "until your next turn" area effects expire (Babbling Brook, Bog, Leadworks)
  for (const key of ['areaDisables', 'immobileSites', 'siteSilences', 'enduringFaith', 'shieldWall', 'courtDisables'] as const) {
    if (state.flow?.[key]) {
      state.flow[key] = state.flow[key].filter(
        (e: { player: PlayerId; turn: number }) => !(e.player === player && e.turn < state.turn),
      )
    }
  }

  // untap all of this player's cards ("they don't untap the next time they
  // would" effects — Waveshaper, Blasphemy — consume a skipUntap marker instead)
  const untapBan = Object.values(state.units).some(
    (u) => !u.silenced && getScript(u.name)?.preventsOtherUntaps,
  )
  for (const unit of unitsOf(state, player)) {
    if (unit.tapped && unit.counters?.skipUntap) {
      delete unit.counters.skipUntap
    } else if (unit.tapped && untapBan && !unit.isAvatar && !(getScript(unit.name)?.preventsOtherUntaps && !unit.silenced)) {
      // Rhitta Gawr: other minions can't untap
    } else {
      unit.tapped = false
    }
    unit.usedThisTurn = {}
  }
  for (const site of sitesOf(state, player)) site.tapped = false
  for (const art of Object.values(state.artifacts)) {
    const carrier = art.carriedBy ? state.units[art.carriedBy] : null
    if (carrier ? carrier.controller === player : art.conjuredBy === player) art.tapped = false
  }
  p.usedAvatarSiteAbility = false

  // sites provide mana. Each source floats a "+n 🔮" over itself (recordManaGain) so both players
  // see where the turn's mana came from.
  let mana = 0
  // enemy sites that provide for everyone (Avalon)
  for (const site of Object.values(state.sites)) {
    if (site.isRubble || site.controller === player || site.controller === null) continue
    if (getScript(site.name)?.providesForEveryone && !siteDisabledByArtifact(state, site)) {
      mana += 1
      recordManaGain(state, site.x, site.y, 'surface', 1)
    }
  }
  for (const site of sitesOf(state, player)) {
    if (site.isRubble || siteDisabledByArtifact(state, site)) continue
    const silenced = siteSilenced(state, site)
    const gate = getScript(site.name)?.siteProvides
    if (gate && !silenced && !gate(state, site)) continue
    if (getScript(site.name)?.noMana) continue // Wedding Hall: no mana, ever
    let gain = 1 + (silenced ? 0 : getScript(site.name)?.siteExtraMana ?? 0)
    const fn = getScript(site.name)?.siteExtraManaFn
    if (fn && !silenced) gain += fn(state, site.id)
    // aura-boosted sites (Abundance)
    for (const r of Object.values(state.auras)) {
      const extra = getScript(r.name)?.auraSiteExtraMana
      if (extra && r.squares.some((s) => s.x === site.x && s.y === site.y)) gain += extra
    }
    mana += gain
    recordManaGain(state, site.x, site.y, 'surface', gain)
  }
  // scripted extra mana (Älvalinne Dryads, elemental Cores, Ether Core...)
  const extraOf = (name: string, id: string): number => {
    const e = getScript(name)?.extraManaEachTurn
    return typeof e === 'function' ? e(state, id) : e ?? 0
  }
  for (const unit of unitsOf(state, player)) {
    if (unit.silenced) continue
    const e = extraOf(unit.name, unit.id)
    mana += e
    recordManaGain(state, unit.x, unit.y, unit.region, e) // Dryads / Finwife next to the enemy avatar
  }
  for (const art of Object.values(state.artifacts)) {
    const controller = art.carriedBy ? state.units[art.carriedBy]?.controller : art.conjuredBy
    if (controller !== player) continue
    const e = extraOf(art.name, art.id)
    mana += e
    const bearer = art.carriedBy ? state.units[art.carriedBy] : null
    recordManaGain(state, bearer?.x ?? art.x, bearer?.y ?? art.y, bearer?.region ?? art.region, e)
  }
  // extorted mana owed from last turn (Bridge Troll)
  if (state.flow?.manaGift?.[player]) {
    mana += state.flow.manaGift[player]
    pushLog(state, player, `${p.name} collects ${state.flow.manaGift[player]} extorted mana.`)
    state.flow.manaGift[player] = 0
  }
  p.mana = mana

  // per-turn trackers reset (deaths from LAST turn stay visible one turn)
  state.flow = state.flow ?? {}
  state.flow.lifeLost = { 0: 0, 1: 0 }
  state.flow.manaSpent = { 0: 0, 1: 0 } // remaining/total mana widget (total = remaining + spent)
  state.flow.killerByVictim = {} // per-victim kill credit (Accursed Albatross et al.); combat deaths are same-turn
  state.flow.damageCredit = {}   // per-victim damager list feeding kill credit
  state.flow.airCastSum = { 0: 0, 1: 0 }
  state.flow.drawsThisTurn = { 0: 0, 1: 0 }
  state.flow.spellDraws = { 0: 0, 1: 0 }
  state.flow.diedLastTurn = state.flow.diedThisTurn ?? []
  state.flow.diedThisTurn = []
  // Assimilator Snail reverts to itself at its controller's next turn
  if (state.flow.snailReverts?.length) {
    state.flow.snailReverts = state.flow.snailReverts.filter((r: any) => {
      if (r.player !== player || r.turn >= state.turn) return true
      const u = state.units[r.unitId]
      if (u) {
        u.name = r.back
        pushLog(state, player, 'The Assimilator Snail sloughs off its borrowed shape.')
      }
      return false
    })
  }

  // start-of-turn triggers you control — when several want to resolve, you pick
  // the order (a lone effect resolves with no prompt).
  const refs = collectTurnTriggers(state, player, 'startOfTurn')
  if (refs.length >= 2) {
    pushPrompt(state, {
      player,
      kind: 'orderCards',
      title: 'Order your start-of-turn effects',
      data: { cards: refs.map((r) => triggerName(state, r)), labels: orderLabels(state, refs), place: 'resolve' },
      cont: 'turn:orderStart',
      ctx: { player, refs },
    })
    return
  }
  if (refs.length === 1) runTurnTrigger(state, player, refs[0], 'startOfTurn')
  continueBeginTurn(state, player)
}

registerCont('turn:orderStart', (state, ctx: { player: PlayerId; refs: TriggerRef[] }, choice) => {
  queueOrderedTriggers(state, ctx.player, ctx.refs, resolveOrder(choice, ctx.refs.length), 'startOfTurn', 'turn:finishBegin')
})

// Run each chosen turn-trigger as its OWN parked step, so it resolves COMPLETELY — including any prompt
// it raises — before the next trigger fires: runTurnSteps drains one step at a time and pauses the whole
// drain while a prompt is pending. The matching finish step (draw / cleanup) is queued LAST, after every
// trigger, replacing the old back-to-back loop that fired every trigger before the first prompt resolved.
function queueOrderedTriggers(state: GameState, player: PlayerId, refs: TriggerRef[], order: number[], hook: 'startOfTurn' | 'endOfTurn', finishCont: string): void {
  for (const i of order) deferTurnStep(state, 'turn:runTrigger', { player, ref: refs[i], hook })
  deferTurnStep(state, finishCont, { player })
}
registerCont('turn:runTrigger', (state, ctx: { player: PlayerId; ref: TriggerRef; hook: 'startOfTurn' | 'endOfTurn' }) => {
  runTurnTrigger(state, ctx.player, ctx.ref, ctx.hook)
})

/** Advance to the draw step — but only after any start-of-turn trigger prompts
 *  (the Seer's peek/keep-bottom choice, etc.) have fully resolved. If a trigger
 *  left a prompt pending, park finishBeginTurn until the queue drains. */
function continueBeginTurn(state: GameState, player: PlayerId): void {
  if (state.prompts.length) deferTurnStep(state, 'turn:finishBegin', { player })
  else finishBeginTurn(state, player)
}
registerCont('turn:finishBegin', (state, ctx: { player: PlayerId }) => finishBeginTurn(state, ctx.player))

/** globals + draw step: runs after the player's ordered start-of-turn triggers. */
function finishBeginTurn(state: GameState, player: PlayerId): void {
  const p = state.players[player]
  // "at the start of EVERY turn" triggers, for everything in play (Black Obelisk).
  // These belong to either player, so they are not part of the ordered set above.
  for (const unit of Object.values(state.units)) {
    const script = getScript(unit.name)
    if (script?.startOfEachTurn && !unit.silenced && !isDisabled(state, unit)) script.startOfEachTurn(makeCtx(state, unit.id, unit.controller, []), player)
  }
  for (const site of Object.values(state.sites)) {
    const script = getScript(site.name)
    if (script?.startOfEachTurn && !siteSilenced(state, site) && site.controller !== null)
      script.startOfEachTurn(makeCtx(state, site.id, site.controller, []), player)
  }
  for (const art of Object.values(state.artifacts)) {
    const script = getScript(art.name)
    const controller = art.carriedBy ? state.units[art.carriedBy]?.controller : art.conjuredBy
    if (script?.startOfEachTurn && controller !== undefined && !artifactSilenced(state, art)) script.startOfEachTurn(makeCtx(state, art.id, controller, []), player)
  }
  checkStateBased(state)
  if ((state.phase as string) === 'over') return

  // draw step: first player skips the draw on the very first turn
  if (state.turn === 1 && player === state.firstPlayer) {
    pushLog(state, player, `${p.name} skips the first-turn draw.`)
    afterDrawStep(state, player)
    return
  }
  // Magician (no atlas) and Pathfinder (can't play hand sites) are never asked
  // which deck to draw from — they just draw a spell.
  if (noAtlasDrawChoice(state, player)) {
    drawCards(state, player, 'spellbook')
    afterDrawStep(state, player)
    return
  }
  pushPrompt(state, {
    player,
    kind: 'drawDeck',
    title: 'Draw from your spellbook or your atlas?',
    data: { options: ['spellbook', 'atlas'] },
    cont: 'turn:draw',
    ctx: { player },
  })
}

registerCont('turn:draw', (state, ctx, choice) => {
  const deck = choice === 'atlas' ? 'atlas' : 'spellbook'
  drawCards(state, ctx.player, deck)
  afterDrawStep(state, ctx.player)
})

/** After the draw (or skipped draw): each player MUST play a site on their first
 *  turn, placed under their avatar. Force that pick before the main phase opens;
 *  otherwise (already done, or no site in hand) go straight to main. */
function afterDrawStep(state: GameState, player: PlayerId): void {
  if ((state.phase as string) === 'over') return
  const p = state.players[player]
  const avatar = avatarOf(state, player)
  // Turn 1: each player must establish a site under their avatar. AND — per "Avatars in the void
  // have a mandatory action" (Codex/Kairos FAQ) — an established avatar stranded on a siteless
  // (void) square (a site was banished / moved out from under it: Roots of Yggdrasil, Kairos…)
  // must likewise play a site from hand beneath itself. Both reuse the same forced flow: tap the
  // avatar, play a site under it, fire its Genesis. Rubble is not void, so it doesn't trigger this.
  // ...only for an avatar that has ACTUALLY established a site (p.established) — a never-established
  // avatar sitting on a bare square is just pre-establishment, not stranded.
  const inVoid = p.established && !siteAt(state, avatar.x, avatar.y)
  if (!p.firstSiteDone || inVoid) {
    const isFirst = !p.firstSiteDone
    p.firstSiteDone = true
    // Pathfinder-style avatars can't play sites from hand. Their first obligatory
    // action instead auto-establishes: tap and play the TOPMOST atlas site UNDER
    // the avatar. No choices → no prompt (site = atlas top, spot = avatar's square).
    if (getScript(avatar.name)?.noStandardSiteAction && p.atlas.length > 0) {
      const cardId = p.atlas.shift()!
      p.hand.push(cardId) // playSite plays from hand
      const tap = canTap(state, avatar)
      if (tap) tapUnit(state, avatar) // uses the avatar's own ability
      const err = playSite(state, player, cardId, avatar.x, avatar.y) // fires Genesis
      if (err) {
        // revert on the (near-impossible) illegal placement
        const i = p.hand.indexOf(cardId)
        if (i >= 0) p.hand.splice(i, 1)
        p.atlas.unshift(cardId)
        if (tap) avatar.tapped = false
        pushLog(state, player, `Pathfinder could not establish: ${err}`)
      } else {
        p.established = true
        runAfterAvatarSitePlay(state, player, cardId)
      }
      if ((state.phase as string) !== 'over') state.phase = 'main'
      return
    }
    const siteIds = p.hand.filter((id) => getCard(state.cards[id].name).type === 'Site')
    if (siteIds.length > 0) {
      pushPrompt(state, {
        player,
        kind: 'firstSite',
        title: isFirst ? 'Play your first site — placed under your avatar.' : 'Your avatar is in the void — play a site beneath it.',
        data: { ids: siteIds, names: siteIds.map((id) => state.cards[id].name) },
        cont: 'turn:firstSite',
        ctx: { player },
      })
      return // main phase waits until the site is placed
    }
  }
  state.phase = 'main'
}

registerCont('turn:firstSite', (state, ctx: { player: PlayerId }, choice) => {
  const p = state.players[ctx.player]
  // trust the chosen hand card if it's a real site; else fall back to the first site
  const cardId = typeof choice === 'string' && p.hand.includes(choice) && getCard(state.cards[choice].name).type === 'Site'
    ? choice
    : p.hand.find((id) => getCard(state.cards[id].name).type === 'Site')
  if (cardId) {
    const avatar = avatarOf(state, ctx.player)
    // Establishing your domain is done "through your Avatar's activated ability:
    // Tap → Play or draw a site" (rulebook: Playing Sites / Your First Turn), so
    // the Avatar taps and can't move/attack for the rest of this first turn.
    // Special avatars that play sites through their own ability pay their own cost.
    const tap = !getScript(avatar.name)?.noStandardSiteAction && canTap(state, avatar)
    if (tap) tapUnit(state, avatar)
    const err = playSite(state, ctx.player, cardId, avatar.x, avatar.y) // fires the site's Genesis
    if (err) {
      if (tap) avatar.tapped = false // refund the tap on an illegal placement
      pushLog(state, ctx.player, `First site could not be placed: ${err}`)
    } else {
      state.players[ctx.player].established = true
      runAfterAvatarSitePlay(state, ctx.player, cardId)
    }
  }
  if ((state.phase as string) !== 'over') state.phase = 'main'
})

/** Fire the avatar's afterAvatarSitePlay rider for a just-placed site. The manual
 *  `avatarSite` action (game.ts) runs this inline; the FORCED first-turn placement
 *  bypassed it, so the Druid's "summon Tawny on your first turn" never triggered. */
function runAfterAvatarSitePlay(state: GameState, player: PlayerId, cardId: string): void {
  const avatar = avatarOf(state, player)
  const after = getScript(avatar.name)?.afterAvatarSitePlay
  if (!after || avatar.silenced) return
  const played = Object.values(state.sites).find((s) => s.cardId === cardId)
  if (played) after(makeCtx(state, avatar.id, player, []), played.id)
}

export function endTurn(state: GameState): void {
  const player = state.activePlayer
  state.phase = 'end'
  // chess-clock increment: the ending player banks their per-turn increment
  if (state.clock) state.clock.remaining[player] += state.clock.inc

  // end-of-turn triggers you control — you order them if there are several
  const refs = collectTurnTriggers(state, player, 'endOfTurn')
  if (refs.length >= 2) {
    pushPrompt(state, {
      player,
      kind: 'orderCards',
      title: 'Order your end-of-turn effects',
      data: { cards: refs.map((r) => triggerName(state, r)), labels: orderLabels(state, refs), place: 'resolve' },
      cont: 'turn:orderEnd',
      ctx: { player, refs },
    })
    return
  }
  if (refs.length === 1) runTurnTrigger(state, player, refs[0], 'endOfTurn')
  continueEndTurn(state, player)
}

registerCont('turn:orderEnd', (state, ctx: { player: PlayerId; refs: TriggerRef[] }, choice) => {
  queueOrderedTriggers(state, ctx.player, ctx.refs, resolveOrder(choice, ctx.refs.length), 'endOfTurn', 'turn:finishEnd')
})

/** Run end-of-turn cleanup + hand-off — but only after any end-of-turn trigger
 *  prompts have resolved (so heals/expiries never fire before the effect that
 *  provoked them). Park finishEndTurn until the prompt queue drains. */
function continueEndTurn(state: GameState, player: PlayerId): void {
  if (state.prompts.length) deferTurnStep(state, 'turn:finishEnd', { player })
  else finishEndTurn(state, player)
}
registerCont('turn:finishEnd', (state, ctx: { player: PlayerId }) => finishEndTurn(state, ctx.player))

/** globals + cleanup + hand-off to the next turn: runs after the player's ordered
 *  end-of-turn triggers. */
function finishEndTurn(state: GameState, player: PlayerId): void {
  // "at the end of each turn" triggers, for everything in play
  for (const unit of Object.values(state.units)) {
    const script = getScript(unit.name)
    if (script?.endOfEveryTurn && !unit.silenced && !isDisabled(state, unit)) script.endOfEveryTurn(makeCtx(state, unit.id, unit.controller, []))
  }
  for (const site of Object.values(state.sites)) {
    if (site.controller === null) continue
    const script = getScript(site.name)
    if (script?.endOfEveryTurn && !siteSilenced(state, site)) script.endOfEveryTurn(makeCtx(state, site.id, site.controller, []))
  }
  for (const art of Object.values(state.artifacts)) {
    const controller = art.carriedBy ? state.units[art.carriedBy]?.controller : art.conjuredBy
    const script = getScript(art.name)
    if (script?.endOfEveryTurn && controller !== undefined && !artifactSilenced(state, art)) script.endOfEveryTurn(makeCtx(state, art.id, controller, []))
  }
  // auras too — Wildfire moves + burns at the end of each turn (was never dispatched,
  // so Wildfire "did not move"). Snapshot ids first: a hook may add/remove auras.
  for (const auraId of Object.keys(state.auras)) {
    const aura = state.auras[auraId]
    if (!aura) continue
    const script = getScript(aura.name)
    if (script?.endOfEveryTurn) script.endOfEveryTurn(makeCtx(state, aura.id, aura.controller, []))
  }
  checkStateBased(state)
  if ((state.phase as string) === 'over') return

  // all minions heal
  for (const unit of Object.values(state.units)) {
    if (!unit.isAvatar) unit.damage = 0
  }
  // ...including the still-living parts of a Stitched Abomination (destroyed
  // parts stay destroyed)
  for (const [unitId, parts] of Object.entries((state.flow?.abomParts ?? {}) as Record<string, { name: string; damage: number }[]>)) {
    if (!state.units[unitId]) continue
    for (const part of parts) {
      const tough = Math.max(1, getCard(part.name).defence ?? getCard(part.name).attack ?? 1)
      if (part.damage < tough) part.damage = 0
    }
  }
  // effects that last for the turn end
  for (const unit of Object.values(state.units)) {
    unit.modifiers = unit.modifiers.filter((m) => m.duration !== 'endOfTurn')
  }
  // "return to hand after each turn" artifacts (Torshammar Trinket). Done HERE — after the
  // heal above and the endOfTurn buff expiry — so a minion that survived the turn only
  // thanks to the artifact's +power (which raises its effective defence) keeps living once
  // its damage is cleared, instead of dying the instant the buff leaves (Torshammar FAQ).
  // Damage-DEALING end-of-turn effects (Wildfire) already resolved earlier and still kill.
  for (const art of Object.values(state.artifacts)) {
    if (!getScript(art.name)?.returnToHandAfterTurn || artifactSilenced(state, art)) continue
    if (art.carriedBy) {
      const carrier = state.units[art.carriedBy]
      if (carrier) carrier.carrying = carrier.carrying.filter((id) => id !== art.id)
    }
    const card = state.cards[art.cardId]
    if (card && !card.isToken) state.players[card.owner].hand.push(card.id)
    delete state.artifacts[art.id]
    pushLog(state, player, `The ${art.name} flies back to its owner.`)
  }
  // unspent mana is lost
  state.players[player].mana = 0

  // "flood until end of turn" effects end — but only drain a site if no PERSISTENT source (a Tide
  // Naiads, a Waveshaper's wave, The Flood) still floods it (the end-of-turn floods are the ones expiring)
  for (const siteId of state.flow?.unfloodAtEnd ?? []) {
    const s = state.sites[siteId]
    if (s) s.flooded = siteStillFlooded(state, siteId, { excludeEndOfTurn: true })
  }
  if (state.flow?.unfloodAtEnd) state.flow.unfloodAtEnd = []
  // "control until end of turn" effects end (Betrayal)
  for (const rev of state.flow?.controlReverts ?? []) {
    const u = state.units[rev.unitId]
    if (u) {
      u.controller = rev.to
      pushLog(state, rev.to, `${u.name} shakes off the betrayal.`)
    }
  }
  if (state.flow?.controlReverts) state.flow.controlReverts = []
  // one-shot strike flags expire (Critical Strike, Gift of the Raven)
  if (state.flow?.strikeFlags) state.flow.strikeFlags = []
  // Kiss of Judas wears off
  if (state.flow?.judasKiss) state.flow.judasKiss = []
  // one-turn threshold boosts fade (Blooms, Annual Fair)
  if (state.flow?.tempThresh) state.flow.tempThresh = {}
  // an unspent Blood Mana pact fades with the turn
  if (state.flow?.bloodMana) state.flow.bloodMana = {}
  // spasming minions burn out at end of turn (Warp Spasm)
  for (const e of (state.flow?.dieAtEnd ?? []) as { unitId: string; turn: number }[]) {
    const u = state.units[e.unitId]
    if (u && e.turn === state.turn) {
      pushLog(state, u.controller, `${u.name} collapses, spent.`)
      killUnit(state, u.id)
    }
  }
  if (state.flow?.dieAtEnd) state.flow.dieAtEnd = []
  // Koschei's Egg: the pact runs out after three of your turns
  if (state.flow?.koschei?.player === player) {
    state.flow.koschei.turns -= 1
    if (state.flow.koschei.turns <= 0) {
      const p = state.flow.koschei.player as PlayerId
      pushLog(state, p, `Koschei's Egg claims ${state.players[p].name}'s hidden soul!`)
      state.winner = opponent(p)
      state.phase = 'over'
      return
    }
    pushLog(state, player, `Koschei's Egg: ${state.flow.koschei.turns} of your turns remain.`)
  }
  checkStateBased(state)
  if ((state.phase as string) === 'over') return
  // plundered spells that went uncast return to their owner's cemetery
  // (Sea Raider, Captain Baldassare)
  for (const e of (state.flow?.plunder ?? []) as { cardId: string; holder: PlayerId }[]) {
    const holder = state.players[e.holder]
    const at = holder.hand.indexOf(e.cardId)
    if (at >= 0) {
      holder.hand.splice(at, 1)
      const owner = state.cards[e.cardId]?.owner
      if (owner !== undefined) state.players[owner].cemetery.push(e.cardId)
      pushLog(state, e.holder, `${state.cards[e.cardId].name} slips back to its owner's cemetery.`)
    }
  }
  if (state.flow?.plunder) state.flow.plunder = []
  // lent cards (cast-from-top/collection offers) that went uncast return home
  for (const e of (state.flow?.lends ?? []) as { cardId: string; holder: PlayerId; returnTo: 'spellbookTop' | 'cemetery' | 'vanish'; owner: PlayerId }[]) {
    const holder = state.players[e.holder]
    const at = holder.hand.indexOf(e.cardId)
    if (at < 0) continue
    holder.hand.splice(at, 1)
    if (e.returnTo === 'spellbookTop') state.players[e.owner].spellbook.unshift(e.cardId)
    else if (e.returnTo === 'cemetery') state.players[e.owner].cemetery.push(e.cardId)
    // 'vanish': collection offers simply cease to exist
    if (e.returnTo !== 'vanish') pushLog(state, e.holder, `${state.cards[e.cardId].name} returns whence it came.`)
  }
  if (state.flow?.lends) state.flow.lends = []
  if (state.flow?.offerCast) state.flow.offerCast = []
  // location locks expire with the turn — except those bonded to a permanent
  // caster lock (the Omphalos artifacts)
  if (state.flow?.castAtOnly) {
    const locked = new Set(((state.flow.lockedCards ?? []) as { cardId: string }[]).map((e) => e.cardId))
    state.flow.castAtOnly = state.flow.castAtOnly.filter((e: any) => locked.has(e.cardId))
  }
  // Witch's curse spends itself once the victim's next turn has ended
  if (state.flow?.witchCurse) {
    state.flow.witchCurse = state.flow.witchCurse.filter(
      (c: { player: PlayerId; turn: number }) => !(c.player === player && state.turn > c.turn),
    )
  }
  // Peace Offering truces lapse after the bound player's next turn
  if (state.flow?.peaceTruce) {
    state.flow.peaceTruce = state.flow.peaceTruce.filter(
      (t: { bound: PlayerId; turn: number }) => !(t.bound === player && state.turn > t.turn),
    )
  }
  // "silence this turn" effects end (Grievous Insult)
  for (const unitId of state.flow?.unsilenceAtEnd ?? []) {
    const u = state.units[unitId]
    if (u) u.silenced = undefined
  }
  if (state.flow?.unsilenceAtEnd) state.flow.unsilenceAtEnd = []
  checkStateBased(state)
  if ((state.phase as string) === 'over') return

  beginTurn(state, opponent(player))
}

// ---------- orderable turn triggers ----------
// A player's own "at the start/end of your turn" abilities may resolve in any
// order the player chooses (the turn player orders their simultaneous triggers).
// We collect them; with more than one we ask for an order, a lone trigger just
// resolves. Global "each turn" triggers (Black Obelisk et al.) are NOT part of
// this set — they can belong to either player, so they run afterwards in a fixed
// order inside finishBeginTurn / finishEndTurn.

type TriggerRef = { kind: 'unit' | 'site' | 'artifact' | 'aura' | 'cemetery'; sourceId: string }

function collectTurnTriggers(state: GameState, player: PlayerId, hook: 'startOfTurn' | 'endOfTurn'): TriggerRef[] {
  const refs: TriggerRef[] = []
  for (const unit of unitsOf(state, player)) {
    // a disabled minion (Monstermorphosis chrysalis, Freeze, etc.) loses ALL its
    // abilities — including its start/end-of-turn triggers, not just when silenced.
    if (!unit.silenced && !isDisabled(state, unit) && getScript(unit.name)?.[hook]) refs.push({ kind: 'unit', sourceId: unit.id })
  }
  for (const site of sitesOf(state, player)) {
    if (!siteSilenced(state, site) && getScript(site.name)?.[hook]) refs.push({ kind: 'site', sourceId: site.id })
  }
  for (const art of Object.values(state.artifacts)) {
    const controller = art.carriedBy ? state.units[art.carriedBy]?.controller : art.conjuredBy
    if (controller === player && getScript(art.name)?.[hook] && !artifactSilenced(state, art)) refs.push({ kind: 'artifact', sourceId: art.id })
  }
  for (const aura of Object.values(state.auras)) {
    if (aura.controller === player && getScript(aura.name)?.[hook]) refs.push({ kind: 'aura', sourceId: aura.id })
  }
  // cemetery listeners only have a start-of-turn hook (Dream-Quest, Monstermorphosis)
  if (hook === 'startOfTurn') {
    for (const cardId of [...state.players[player].cemetery]) {
      const name = state.cards[cardId]?.name
      const script = name ? getScript(name) : undefined
      if (script?.listensFromCemetery && script.startOfTurn) refs.push({ kind: 'cemetery', sourceId: cardId })
    }
  }
  return refs
}

/** run one collected trigger, re-checking the source at run time (an earlier
 *  trigger in the chosen order may have removed or silenced it). */
function runTurnTrigger(state: GameState, player: PlayerId, ref: TriggerRef, hook: 'startOfTurn' | 'endOfTurn'): void {
  // resolve the source + whether the trigger is eligible to fire this turn
  let srcId: string | null = null
  let srcName = ''
  let fire: (() => void) | null = null
  if (ref.kind === 'unit') {
    const u = state.units[ref.sourceId]
    if (u && u.controller === player && !u.silenced && !isDisabled(state, u)) { srcId = u.id; srcName = u.name; fire = () => getScript(u.name)?.[hook]?.(makeCtx(state, u.id, player, [])) }
  } else if (ref.kind === 'site') {
    const s = state.sites[ref.sourceId]
    if (s && s.controller === player && !siteSilenced(state, s)) { srcId = s.id; srcName = s.name; fire = () => getScript(s.name)?.[hook]?.(makeCtx(state, s.id, player, [])) }
  } else if (ref.kind === 'artifact') {
    const a = state.artifacts[ref.sourceId]
    const controller = a?.carriedBy ? state.units[a.carriedBy]?.controller : a?.conjuredBy
    if (a && controller === player && !artifactSilenced(state, a)) { srcId = a.id; srcName = a.name; fire = () => getScript(a.name)?.[hook]?.(makeCtx(state, a.id, player, [])) }
  } else if (ref.kind === 'aura') {
    const r = state.auras[ref.sourceId]
    if (r && r.controller === player) { srcId = r.id; srcName = r.name; fire = () => getScript(r.name)?.[hook]?.(makeCtx(state, r.id, player, [])) }
  } else {
    const name = state.cards[ref.sourceId]?.name
    const script = name ? getScript(name) : undefined
    if (script?.listensFromCemetery && state.players[player].cemetery.includes(ref.sourceId)) { srcId = ref.sourceId; srcName = name!; fire = () => script[hook]?.(makeCtx(state, ref.sourceId, player, [])) }
  }
  if (!fire || !srcId) return
  // Start-of-turn triggers don't animate (the incoming turn's draw/steps would clobber the single
  // reveal slot). END-of-turn triggers animate like a cast — but ONLY if they ACTUALLY did something
  // (a whole-realm fingerprint diff decides), so an idle conditional trigger doesn't flash every turn.
  if (hook !== 'endOfTurn') { fire(); return }
  const prevReveal = state.flow?.areaReveal
  const snap = snapshotRealm(state)
  const before = turnFingerprint(state)
  beginAreaReveal(state, undefined, srcName, srcId) // opened BEFORE fire so any damage it deals is captured
  fire()
  if (turnFingerprint(state) !== before) {
    recordTouchedSites(state, snap) // glow the unit/artifact sites it changed / created / removed…
    sealAbilityReveal(state, state.flow?.areaReveal?.shoots ? `${srcName} shoots!` : `${srcName}'s ability`) // …else the source's own site
    if (state.flow?.areaReveal) state.flow.areaReveal.open = false // don't let later endOfEveryTurn hooks append
  } else if (state.flow) {
    state.flow.areaReveal = prevReveal // no-op trigger: restore the prior reveal, don't clobber another trigger's animation
  }
}

function triggerName(state: GameState, ref: TriggerRef): string {
  const src =
    ref.kind === 'unit' ? state.units[ref.sourceId]
    : ref.kind === 'site' ? state.sites[ref.sourceId]
    : ref.kind === 'artifact' ? state.artifacts[ref.sourceId]
    : ref.kind === 'aura' ? state.auras[ref.sourceId]
    : undefined
  return src?.name ?? state.cards[ref.sourceId]?.name ?? '?'
}

function triggerCoord(state: GameState, ref: TriggerRef): { x: number; y: number } | undefined {
  if (ref.kind === 'unit') { const u = state.units[ref.sourceId]; return u ? { x: u.x, y: u.y } : undefined }
  if (ref.kind === 'site') { const s = state.sites[ref.sourceId]; return s ? { x: s.x, y: s.y } : undefined }
  if (ref.kind === 'aura') { const r = state.auras[ref.sourceId]; const sq = r?.squares?.[0]; return sq ? { x: sq.x, y: sq.y } : undefined }
  if (ref.kind === 'artifact') {
    const a = state.artifacts[ref.sourceId]
    const carrier = a?.carriedBy ? state.units[a.carriedBy] : null
    return carrier ? { x: carrier.x, y: carrier.y } : undefined
  }
  return undefined
}

/** label only the duplicates: two effects from same-named cards each get a board
 *  coordinate so the player can tell them apart; unique names get no extra label. */
function orderLabels(state: GameState, refs: TriggerRef[]): string[] {
  const names = refs.map((r) => triggerName(state, r))
  return refs.map((r, i) => {
    if (names.filter((n) => n === names[i]).length < 2) return ''
    const c = triggerCoord(state, r)
    return c ? `(${c.x},${c.y})` : `#${i + 1}`
  })
}

/** turn a chosen index order into a complete, de-duplicated run order; any missing
 *  picks (e.g. an AI that didn't answer the panel) fall back to canonical order. */
function resolveOrder(choice: unknown, n: number): number[] {
  const out: number[] = []
  const seen = new Set<number>()
  if (Array.isArray(choice)) {
    for (const v of choice) {
      const i = Number(v)
      if (Number.isInteger(i) && i >= 0 && i < n && !seen.has(i)) { seen.add(i); out.push(i) }
    }
  }
  for (let i = 0; i < n; i++) if (!seen.has(i)) out.push(i)
  return out
}
