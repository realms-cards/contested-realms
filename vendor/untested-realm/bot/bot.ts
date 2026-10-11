// A procedural Sorcery bot. Greedy heuristics, no search — fast enough for the
// browser (one action per ~550ms tick). It decides one action at a time from the
// full game state and only inspects its OWN hand/decks plus public information
// (never the opponent's hand/deck/seed — opponent card contents are used only
// where they are already public, e.g. revealed cemetery entries).
//
// This is the STRONGER, MORE AGGRESSIVE successor to bot_legacy.ts. Over the
// legacy bot it adds, roughly in order of impact:
//   • a whole-board LETHAL SCAN each main phase (melee + ranged + damage spells +
//     damage abilities that can reach a death's-door / killable enemy avatar);
//   • SITE ATTACKS (razing enemy sites drains their life and denies resources);
//   • ACTIVATED ABILITIES on units / sites / carried & ground artifacts;
//   • AURA casting (buff own clusters, drop hostile auras on enemy clusters);
//   • SUBSURFACE summoning for Submerge/Burrowing minions under threat;
//   • ARTIFACTS handed to the strongest frontline minion (weapons/armor) instead
//     of always the avatar;
//   • EXPANSION-caster + Spellcaster-minion casting (the 7 "may be cast by an
//     allied X" spells finally get played), and cemetery casts;
//   • avatar aggression with a survivability safety valve;
//   • and full prompt coverage — every prompt kind returns an engine-legal answer
//     (no default→null concede cascade).

import {
  affinity,
  applyAction,
  avatarOf,
  canCast,
  canActivate,
  chebyshev,
  effAttack,
  effDefence,
  effKeywords,
  findPath,
  getCard,
  getScript,
  legalSiteSquares,
  noAtlasDraw,
  reachableLocations,
  unitsAt,
  validateSummonAt,
  canTap,
  isDisabled,
  type Action,
  type GameState,
  type PlayerId,
  type UnitState,
  type SiteState,
  type Step,
  actingSeatFor,
} from '@sorcery/shared'

export function botNeedsToAct(state: GameState, me: PlayerId): boolean {
  if (state.phase === 'over') return false
  const prompt = state.prompts[0]
  // Courtesan Thaïs may put another seat's decisions in the bot's hands
  if (prompt) return actingSeatFor(state, prompt.player) === me
  if (state.phase === 'mulligan') return !state.players[me].keptHand
  return actingSeatFor(state, state.activePlayer) === me && state.phase === 'main'
}

export function botAction(state: GameState, me: PlayerId, banned?: Set<string>): Action {
  const prompt = state.prompts[0]
  if (prompt && actingSeatFor(state, prompt.player) === me) return safePromptAnswer(state, prompt)
  if (state.phase === 'mulligan') return mulliganChoice(state, me)
  // Courtesan Thaïs: when the active player's turn is being PILOTED by us (their turn,
  // our seat decides), we're playing the OPPONENT's turn — sabotage it instead of
  // optimising it. `state.activePlayer !== me` is exactly that case (botNeedsToAct has
  // already confirmed we're the one to act).
  if (state.activePlayer !== me) return sabotageMain(state, state.activePlayer, me)
  return mainPhase(state, state.activePlayer, banned)
}

/** stable key for an action, used by the driver's anti-loop ward + mainPhase's `banned` filter. */
export function botActionKey(a: Action): string { return JSON.stringify(a) }

/** Board-level HARM to a seat between two states: its avatar lost life, one of its
 *  minions died or took new damage, or one of its sites was razed. (Ignores hand/mana
 *  so it measures real damage, not resource spend.) */
function boardHarms(before: GameState, after: GameState, who: PlayerId): boolean {
  const avB = avatarOf(before, who)
  const avA = after.units[avB.id]
  if (!avA) return true
  if ((avA.life ?? 0) < (avB.life ?? 0)) return true
  for (const u of Object.values(before.units)) {
    if (u.controller !== who || u.isAvatar) continue
    const a = after.units[u.id]
    if (!a) return true // a minion died
    if (a.damage > u.damage) return true // a minion took damage
  }
  for (const s of Object.values(before.sites)) {
    if (s.controller !== who || s.isRubble) continue
    const a = after.sites[s.id]
    if (!a || a.isRubble || a.controller !== who) return true // a site was razed / lost
  }
  return false
}

/** Courtesan Thaïs, vs-Computer: when forced to pilot the HUMAN's turn, the bot plays
 *  it to SABOTAGE the seat it controls (`foe`) in favour of its own seat (`me`). Fringe
 *  by design — a greedy one-action-per-call policy, every action APPLIED as `me` (the
 *  engine's Thaïs dispatch then remaps it to `foe`), validated exactly that way.
 *  Priority: strip foe's artifacts → shove foe's avatar onto our side (or waste its
 *  attack non-lethally on us) → scatter foe's minions from our avatar/sites (or throw
 *  them into suicidal non-lethal attacks) → dump foe's magics only where they harm foe
 *  and never us. */
export function sabotageMain(state: GameState, foe: PlayerId, me: PlayerId): Action {
  const myAvatar = avatarOf(state, me)
  const foeAvatar = avatarOf(state, foe)
  const myUnits = Object.values(state.units).filter((u) => u.controller === me && !u.carriedBy)
  const mySites = Object.values(state.sites).filter((s) => s.controller === me && !s.isRubble)
  const foeUnits = Object.values(state.units).filter((u) => u.controller === foe && !u.carriedBy)

  const rem = (u: UnitState) => (u.isAvatar ? u.life ?? 0 : effDefence(state, u) - u.damage)
  const kills = (att: UnitState, tgt: UnitState): boolean => {
    const pow = effAttack(state, att)
    if (tgt.isAvatar) return tgt.deathsDoor ? pow >= 1 : pow >= (tgt.life ?? 0)
    return pow >= rem(tgt) || !!effKeywords(state, att).lethal
  }
  const ok = (a: Action) => isLegal(state, me, a) && actionMakesProgress(state, me, a)

  const reachTo = (u: UnitState, loc: { x: number; y: number; region: string }): Step[] | null =>
    loc.x === u.x && loc.y === u.y && loc.region === u.region ? [] : findPath(state, u, loc as any)
  const attackAt = (u: UnitState, tgt: UnitState): Action | null => {
    for (const loc of [{ x: u.x, y: u.y, region: u.region }, ...reachableLocations(state, u)]) {
      if (loc.x !== tgt.x || loc.y !== tgt.y || loc.region !== tgt.region) continue
      const path = reachTo(u, loc)
      if (path === null) continue
      const a: Action = { t: 'moveAttack', unitId: u.id, path, attack: { unit: tgt.id } }
      if (ok(a)) return a
    }
    return null
  }
  const stepScored = (u: UnitState, score: (loc: { x: number; y: number }) => number): Action | null => {
    const cands = reachableLocations(state, u)
      .map((loc) => ({ loc, s: score(loc) }))
      .sort((a, b) => b.s - a.s)
    for (const { loc } of cands) {
      const path = findPath(state, u, loc)
      if (!path || !path.length) continue
      const a: Action = { t: 'moveAttack', unitId: u.id, path }
      if (ok(a)) return a
    }
    return null
  }

  // 1) strip foe's equipment
  for (const u of foeUnits) {
    if (u.carrying.length) {
      const a: Action = { t: 'drop', unitId: u.id, artifactIds: [...u.carrying], unitIds: [] }
      if (ok(a)) return a
    }
  }

  // 2) foe avatar: waste its attack non-lethally on one of ours, else march to our side
  if (foeAvatar && canTap(state, foeAvatar) && !isDisabled(state, foeAvatar)) {
    for (const tgt of myUnits) {
      if (kills(foeAvatar, tgt)) continue // must NOT kill it
      const a = attackAt(foeAvatar, tgt)
      if (a) return a
    }
    const toward = stepScored(foeAvatar, (loc) => -chebyshev(loc, myAvatar)) // minimise distance to our avatar
    if (toward) return toward
  }

  // 3) foe minions: suicidal non-lethal chump, else scatter away from our avatar + sites
  for (const u of foeUnits) {
    if (u.isAvatar || !canTap(state, u) || isDisabled(state, u)) continue
    for (const tgt of myUnits) {
      if (kills(u, tgt) || !kills(tgt, u)) continue // must NOT kill ours, and MUST die to it
      const a = attackAt(u, tgt)
      if (a) return a
    }
  }
  for (const u of foeUnits) {
    if (u.isAvatar || !canTap(state, u) || isDisabled(state, u)) continue
    const anchors = [myAvatar, ...mySites]
    const away = stepScored(u, (loc) => Math.min(...anchors.map((t) => chebyshev(loc, t))))
    if (away) return away
  }

  // 4) foe magics: cast only what harms FOE and never us (skip buffs/inert → do nothing)
  for (const cardId of state.players[foe].hand) {
    if (getCard(state.cards[cardId].name).type !== 'Magic') continue
    const cast = sabotageCast(state, foe, me, cardId, foeAvatar, foeUnits)
    if (cast) return cast
  }

  return { t: 'endTurn' }
}

/** Find a cast of `cardId` (by foe, piloted by us) that HARMS foe's own board and
 *  leaves ours untouched, opening no follow-up prompt. Returns null if none — we then
 *  simply leave the spell unplayed ("cast magics to do nothing" is allowed). */
function sabotageCast(
  state: GameState,
  foe: PlayerId,
  me: PlayerId,
  cardId: string,
  foeAvatar: UnitState,
  foeUnits: UnitState[],
): Action | null {
  const base = { t: 'castSpell' as const, cardId, casterId: foeAvatar.id }
  const candidates: Action[] = [{ ...base, targets: [] }]
  for (const u of foeUnits) candidates.push({ ...base, targets: [u.id] })
  for (const dir of ['n', 's', 'e', 'w']) candidates.push({ ...base, extra: { direction: dir }, targets: [] })
  for (const s of Object.values(state.sites)) {
    if (s.controller === foe && !s.isRubble) candidates.push({ ...base, at: { x: s.x, y: s.y } })
  }
  for (const a of candidates) {
    let dry: GameState
    try { dry = structuredClone(state) } catch { continue }
    let ok = false
    try { ok = applyAction(dry, me, a).ok } catch { continue }
    if (!ok) continue
    if (dry.prompts.length > state.prompts.length) continue // needs a follow-up choice → skip
    if (!boardHarms(state, dry, foe)) continue // must actually hurt foe (else it's a buff/inert)
    if (boardHarms(state, dry, me)) continue // never damage our own board
    return a
  }
  return null
}

// ---------- small shared helpers ----------

const REGIONS = ['air', 'earth', 'fire', 'water'] as const

function enemyOf(me: PlayerId): PlayerId {
  return (1 - me) as PlayerId
}

/** power available at a square standing in for a unit — used to score reach. */
function atLoc(u: UnitState, loc: { x: number; y: number; region: string }): UnitState {
  return { ...u, x: loc.x, y: loc.y, region: loc.region as any } as UnitState
}

/**
 * Dry-run an action on a throwaway clone of the state and report whether the
 * engine ACCEPTS it. This is the bot's safety net: the client falls back to a
 * concede cascade on any illegal action, so before returning a complex action
 * (casts, ability activations) we confirm it's legal — a mismatch between the
 * bot's target heuristics and the engine's target-legality rules then just makes
 * the bot try the next option instead of looping forever on a rejected cast.
 * GameState is plain serializable data, so structuredClone is safe and cheap
 * enough for one-off checks at the UI's ~550ms cadence.
 */
function isLegal(state: GameState, me: PlayerId, action: Action): boolean {
  // Only the target-bearing casts/abilities can suffer a bot/engine target-rule
  // mismatch; a no-target/projectile cast or a bare activation is accepted by the
  // engine whenever canCast/canActivate already said yes, so skip the clone there.
  const needsCheck =
    (action.t === 'castSpell' && ((action.targets?.length ?? 0) > 0 || action.at != null)) ||
    (action.t === 'activate' && (action.targets?.length ?? 0) > 0)
  if (!needsCheck) return true
  let clone: GameState
  try {
    clone = structuredClone(state)
  } catch {
    return true // can't verify → assume legal (never worse than the old behavior)
  }
  try {
    return applyAction(clone, me, action).ok
  } catch {
    return false
  }
}

/** A cheap signature of the MEANINGFUL game state — everything a decision could
 *  hinge on, but NOT the log. Two states with the same signature play identically,
 *  so an action that leaves it unchanged made no progress. */
function progressSig(s: GameState): string {
  const u = Object.values(s.units)
    .map((x) => `${x.id},${x.tapped ? 1 : 0},${x.damage},${x.x},${x.y},${x.region},${x.life ?? ''},${x.carriedBy ?? ''},${x.silenced ? 1 : 0}`)
    .sort()
    .join('|')
  const a = Object.values(s.artifacts)
    .map((x) => `${x.id},${x.tapped ? 1 : 0},${x.x},${x.y},${x.carriedBy ?? ''}`)
    .sort()
    .join('|')
  const pl = s.players
    .map((p) => `${p.mana},${p.hand.length},${p.cemetery.length},${p.banished.length},${Object.values(p.collection ?? {}).reduce((n, v) => n + (v as number), 0)}`)
    .join('/')
  return `${s.nextId}#${s.phase}#${s.winner ?? ''}#${Object.keys(s.sites).length}#${s.prompts?.length ?? 0}#${pl}#${u}#${a}`
}

/** Clone + apply an action and report whether the engine ACCEPTS it AND it
 *  actually changes meaningful state (not just the log). This is the guard against
 *  no-op action loops: an ability that the engine accepts but that does nothing —
 *  e.g. Corpse Catapult's fling with no second untapped ally here to tap — is legal
 *  (ok:true) yet leaves the state identical, so the ~550ms bot driver would re-pick
 *  it forever. Requiring real progress makes the bot skip it and move on. */
function actionMakesProgress(state: GameState, me: PlayerId, action: Action): boolean {
  let clone: GameState
  try {
    clone = structuredClone(state)
  } catch {
    return true // can't verify → don't block (never worse than before)
  }
  try {
    if (!applyAction(clone, me, action).ok) return false
  } catch {
    return false
  }
  return progressSig(clone) !== progressSig(state)
}

/** The bot must develop mana: draw a SITE at least once in its first 3 turns (≤ turn 6). If it reaches
 *  its THIRD turn having drawn no site yet, force an atlas draw — otherwise leave the choice to the
 *  usual heuristics/search. Skipped when the atlas is empty or the avatar never draws sites (Magician). */
export function forceAtlasDraw(state: GameState, me: PlayerId): boolean {
  if (state.players[me].atlas.length === 0 || noAtlasDraw(state, me)) return false
  const myFirstTurn = me === state.firstPlayer ? 1 : 2
  const myTurnIndex = Math.floor((state.turn - myFirstTurn) / 2) + 1 // 1 = first own turn, 2 = second…
  const drawnASite = (state.flow?.atlasDraws?.[me] ?? 0) > 0
  return myTurnIndex === 3 && !drawnASite
}

// ---------- prompts ----------

/** GUARANTEE the bot never freezes on a prompt: take the heuristic answer, but if the
 *  engine would REJECT it (an illegal choice re-opens the same prompt forever — the
 *  "concede cascade"/freeze the user hit on Legion of Gall / Earthquake), fall back to the
 *  choices the prompt actually OFFERS (candidates / squares / options / names / cards), then
 *  to permissive empty/decline shapes — returning the first the engine ACCEPTS. A
 *  subpar-but-legal answer always beats a game-freezing illegal one. */
function safePromptAnswer(state: GameState, prompt: any): Action {
  const accepts = (a: Action): boolean => {
    let clone: GameState
    try { clone = structuredClone(state) } catch { return true } // can't verify → trust it
    try { return applyAction(clone, prompt.player, a).ok } catch { return false }
  }
  const primary = answerPrompt(state, prompt.player, prompt)
  if (accepts(primary)) return primary
  const mk = (choice: any): Action => ({ t: 'prompt', promptId: prompt.id, choice })
  const d = prompt.data ?? {}
  const tries: any[] = []
  for (const c of (d.candidates ?? d.ids ?? [])) { tries.push([c]); tries.push(c) }
  for (const s of (Array.isArray(d.squares) ? d.squares : [])) tries.push(s)
  for (const o of (Array.isArray(d.options) ? d.options : [])) tries.push(o)
  for (const n of (Array.isArray(d.names) ? d.names : [])) tries.push(n)
  if (Array.isArray(d.cards)) { tries.push([0]); tries.push([]) }
  tries.push([], null, false, true, 0)
  for (const t of tries) { const a = mk(t); if (accepts(a)) return a }
  return primary // nothing legal found (shouldn't happen) — return the heuristic anyway
}

function answerPrompt(state: GameState, me: PlayerId, prompt: any): Action {
  const answer = (choice: any): Action => ({ t: 'prompt', promptId: prompt.id, choice })

  switch (prompt.kind) {
    case 'drawDeck': {
      const p = state.players[me]
      // guarantee a site draw in the first 3 turns: on the 3rd own turn with no site drawn yet, force it
      if (forceAtlasDraw(state, me)) return answer('atlas')
      const avatar = avatarOf(state, me)
      const handDefs = p.hand.map((id) => getCard(state.cards[id].name))
      const sitesInHand = handDefs.filter((d) => d.type === 'Site').length
      const canSpell = p.spellbook.length > 0
      const canSite = p.atlas.length > 0
      const mySites = Object.values(state.sites).filter((s) => s.controller === me && !s.isRubble).length
      const hasCastableMinion = p.hand.some((id) => {
        const d = getCard(state.cards[id].name)
        return d.type === 'Minion' && canCast(state, me, id, avatar.id).ok
      })
      if (hasCastableMinion && canSpell) return answer('spellbook')
      const nearShort = handDefs.some((d) => d.type !== 'Site' && d.type !== 'Avatar' && nearlyCastable(state, me, d))
      if (canSite && sitesInHand === 0 && (nearShort || mySites < 2)) return answer('atlas')
      return answer(canSpell ? 'spellbook' : 'atlas')
    }
    case 'firstSite': {
      // forced first-turn site: play one under the avatar. Prefer a land site
      // (provides threshold + mana); fall back to the first offered site.
      const ids: string[] = prompt.data?.ids ?? []
      const land = ids.find((id) => {
        const def = getCard(state.cards[id].name)
        const t = def.thresholds
        return t && (t.air + t.earth + t.fire + t.water) > 0
      })
      return answer(land ?? ids[0])
    }
    case 'defend': {
      // Pick as MANY defenders as needed to kill the attacker (or to save the
      // avatar), preferring cheap survivors first. The engine lets several
      // defenders gang up; more is fine when the attacker is deadly.
      const attacker = state.units[prompt.data?.attackerId]
      const picks: string[] = []
      if (!attacker) return answer(picks)
      const atkPow = effAttack(state, attacker)
      const atkDef = effDefence(state, attacker) - attacker.damage
      const threatensAv = isAvatarThreatened(state, me, attacker)
      const cands = (prompt.data?.candidates ?? [])
        .map((id: string) => state.units[id])
        .filter(Boolean) as UnitState[]
      // sort: those that survive-and-hurt first, then by lowest defence lost
      const ranked = [...cands].sort((a, b) => {
        const aSurv = effDefence(state, a) - a.damage > atkPow ? 0 : 1
        const bSurv = effDefence(state, b) - b.damage > atkPow ? 0 : 1
        if (aSurv !== bSurv) return aSurv - bSurv
        return effAttack(state, b) - effAttack(state, a)
      })
      let dealt = 0
      for (const u of ranked) {
        const survives = effDefence(state, u) - u.damage > atkPow
        // Always throw bodies to protect the avatar; otherwise only commit a
        // defender that helps kill the attacker without a pointless sacrifice.
        if (threatensAv) {
          picks.push(u.id)
          dealt += effAttack(state, u)
          if (dealt >= atkDef) break
        } else if (survives && effAttack(state, u) > 0) {
          picks.push(u.id)
          dealt += effAttack(state, u)
          if (dealt >= atkDef) break
        }
      }
      return answer(picks)
    }
    case 'stayInFight': {
      // A defender has ALREADY joined, so the originally-attacked unit no longer has to take the hit.
      // RETIRE IT BY DEFAULT — that's the point of defending. Keep it in only when the attacker dies
      // *only if* it stays: i.e. its own blow is needed to finish the attacker (the committed defenders
      // can't on their own). Never risk the Avatar for a kill.
      const u = state.units[prompt.data?.unitId]
      if (!u || u.isAvatar) return answer(false)
      const attacker = state.units[prompt.data?.attackerId]
      if (!attacker) return answer(false)
      const defPow = (prompt.data?.defenderIds ?? [])
        .map((id: string) => state.units[id])
        .filter(Boolean)
        .reduce((s: number, d: UnitState) => s + effAttack(state, d), 0)
      const atkLife = effDefence(state, attacker) - attacker.damage
      const killsIfStays = defPow + effAttack(state, u) >= atkLife
      const killsIfRetreats = defPow >= atkLife
      return answer(killsIfStays && !killsIfRetreats)
    }
    case 'intercept': {
      const mover = state.units[prompt.data?.moverId]
      for (const id of prompt.data?.candidates ?? []) {
        const u = state.units[id]
        if (!u || !mover) continue
        const kills = effAttack(state, u) >= effDefence(state, mover) - mover.damage
        const survives = effDefence(state, u) - u.damage > effAttack(state, mover)
        if (kills && (survives || effAttack(state, mover) >= 4)) return answer(id)
      }
      return answer(null)
    }
    case 'allocateDamage': {
      const power: number = prompt.data?.power ?? 0
      const candidates: string[] = prompt.data?.candidates ?? []
      const units = candidates.map((id) => state.units[id]).filter(Boolean) as UnitState[]
      // kill the most dangerous defenders per point spent (power / toughness),
      // securing cheap kills first, then dump overflow on the avatar / biggest.
      const nonAvatar = units.filter((u) => !u.isAvatar)
      const byValue = [...nonAvatar].sort((a, b) => {
        const aNeed = Math.max(1, effDefence(state, a) - a.damage)
        const bNeed = Math.max(1, effDefence(state, b) - b.damage)
        const aRatio = (effAttack(state, a) + 1) / aNeed
        const bRatio = (effAttack(state, b) + 1) / bNeed
        return bRatio - aRatio
      })
      const alloc: Record<string, number> = {}
      let left = power
      for (const u of byValue) {
        const need = Math.max(1, effDefence(state, u) - u.damage)
        if (need <= left) {
          alloc[u.id] = need
          left -= need
        }
      }
      if (left > 0 && units.length) {
        const dump = units.find((u) => u.isAvatar) ?? [...units].sort((a, b) => effAttack(state, b) - effAttack(state, a))[0]
        alloc[dump.id] = (alloc[dump.id] ?? 0) + left
      }
      return answer({ strikerId: prompt.data?.strikerId, allocation: alloc })
    }
    case 'yesNo':
      return answer(yesNoChoice(state, me, prompt))
    case 'chooseOption':
      return answer(chooseOptionChoice(state, me, prompt))
    case 'nameCard': {
      // Some nameCard prompts CONSTRAIN the choice to a list (Legion of Gall: cards in
      // the looked-at collection). Naming anything else just re-opens the prompt → freeze.
      // So when a list is offered, pick FROM it (a seen card if it's in the list, else the
      // first). Only the free-form "name any card" prompt falls back to a seen/default name.
      const names: string[] = prompt.data?.names ?? []
      const opp = state.players[enemyOf(me)]
      const seen = opp?.cemetery?.map((id: string) => state.cards[id]?.name).filter(Boolean) ?? []
      if (names.length) return answer(seen.find((n: string) => names.includes(n)) ?? names[0])
      return answer(seen[0] ?? 'Wildfire')
    }
    case 'chooseTargets': {
      const candidates: string[] = prompt.data?.candidates ?? prompt.data?.ids ?? []
      if (prompt.data?.upTo && candidates.length === 0) return answer([])
      // prefer an enemy unit / any site; buffs would prefer allies but hostile
      // effects dominate the candidate pools here.
      const enemyUnit = candidates.find((id) => state.units[id] && state.units[id].controller !== me)
      if (enemyUnit) return answer([enemyUnit])
      const enemySite = candidates.find((id) => state.sites[id] && state.sites[id].controller !== me)
      if (enemySite) return answer([enemySite])
      // an ally target (buff/heal): the strongest ally
      const allyUnits = candidates
        .map((id) => state.units[id])
        .filter((u) => u && u.controller === me) as UnitState[]
      if (allyUnits.length) return answer([allyUnits.sort((a, b) => effAttack(state, b) - effAttack(state, a))[0].id])
      if (prompt.data?.upTo) return answer([])
      return answer(candidates.length ? [candidates[0]] : [])
    }
    case 'chooseSquare': {
      const only: { x: number; y: number }[] | undefined = prompt.data?.squares
      if (only?.length) {
        const own = only.find((c) => Object.values(state.sites).some((s) => s.controller === me && s.x === c.x && s.y === c.y))
        return answer(own ?? only[0])
      }
      const own = Object.values(state.sites).find((s) => s.controller === me)
      return answer(own ? { x: own.x, y: own.y } : { x: 2, y: me === 0 ? 1 : 2 })
    }
    case 'chooseCards': {
      const pick: number = prompt.data?.pick ?? 1
      const total: number = (prompt.data?.cards ?? []).length
      if (total === 0) return answer([])
      // pick the best `pick` cards for a hand/tutor grab, else the first N.
      return answer(Array.from({ length: Math.min(pick, total) }, (_, i) => i))
    }
    case 'orderCards': {
      // Cover this kind with a sensible order (the legacy bot fell through to
      // default→null here, risking the concede cascade). For 'resolve' order
      // (start/end-of-turn triggers) put damage/removal-flavored effects first;
      // for deck 'top' placement put the best cards on top; else keep shown order.
      const cards: string[] = prompt.data?.cards ?? []
      const labels: string[] = prompt.data?.labels ?? []
      const place: string = prompt.data?.place ?? 'resolve'
      const n = cards.length
      if (n <= 1) return answer(Array.from({ length: n }, (_, i) => i))
      const scoreEntry = (i: number): number => {
        const text = `${cards[i] ?? ''} ${labels[i] ?? ''}`.toLowerCase()
        let s = 0
        if (/(damage|strike|kill|destroy|burn|bolt|fire|slay|banish)/.test(text)) s += 100
        if (/(draw|search|tutor|conjure|summon)/.test(text)) s += 50
        if (/(heal|life|gain)/.test(text)) s += 30
        // for deck placement, prefer cheaper/impactful cards on top
        const def = getCardMaybe(cards[i])
        if (place === 'top' && def) s += Math.max(0, 12 - (def.cost ?? 0))
        return s
      }
      const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => scoreEntry(b) - scoreEntry(a))
      return answer(idx)
    }
    case 'sitePermutation': {
      // Earthquake: the rearrangement is optional. Keep it simple — the identity permutation
      // (rearrange nothing), which is always legal. (Still triggers the burrow step.)
      const squares: { x: number; y: number }[] = prompt.data?.squares ?? []
      return answer({ placements: squares.map((s) => ({ x: s.x, y: s.y, sx: s.x, sy: s.y })) })
    }
    default:
      // Any prompt kind we don't specifically model: try the most permissive
      // legal shapes rather than a bare null (which can cascade to concede).
      if (Array.isArray(prompt.data?.candidates) || prompt.data?.upTo) return answer([])
      return answer(null)
  }
}

function getCardMaybe(name: string): ReturnType<typeof getCard> | null {
  try {
    return getCard(name)
  } catch {
    return null
  }
}

/** yes/no heuristic: say yes when the title reads beneficial (draw / damage /
 *  gain / summon), decline self-sacrifice unless clearly ahead, default yes. */
function yesNoChoice(state: GameState, me: PlayerId, prompt: any): boolean {
  const t = String(prompt.title ?? '').toLowerCase()
  // OPTIONAL-REPEAT prompts ("swap another?", "…again?", "No = done") loop while you say
  // yes — Earthquake's "swap a pair of sites? (No = done rearranging.)" froze the bot when
  // it always said yes. Decline to TERMINATE: a subpar-but-finished play beats a freeze.
  if (/(\bagain\b|\banother\b|\bmore\b|rearrange|swap a pair|no = done|= done|keep going)/.test(t)) return false
  if (/(sacrifice|discard|lose life|pay \d+ life|banish your|destroy your)/.test(t)) {
    return boardAdvantage(state, me) > 3 // only self-cost when clearly ahead
  }
  if (/(draw|damage|deal|gain|summon|search|heal|untap|extra)/.test(t)) return true
  return true
}

/** chooseOption heuristic: prefer an option whose text reads as damage/draw/
 *  advantage; otherwise the first option (always legal). */
function chooseOptionChoice(state: GameState, me: PlayerId, prompt: any): any {
  const options: any[] = prompt.data?.options ?? []
  if (!options.length) return null
  const score = (o: any): number => {
    const s = String(typeof o === 'string' ? o : o?.label ?? o?.name ?? '').toLowerCase()
    let v = 0
    if (/(damage|deal|kill|destroy|strike|burn)/.test(s)) v += 100
    if (/(draw|search|conjure|summon|tutor)/.test(s)) v += 60
    if (/(gain|heal|life|untap)/.test(s)) v += 30
    if (/(sacrifice|discard|lose)/.test(s)) v -= 40
    return v
  }
  return [...options].sort((a, b) => score(b) - score(a))[0]
}

/** rough board advantage in "points" for the acting player (own minions' power+
 *  toughness minus the opponent's, plus a life edge). Cheap and public-only. */
function boardAdvantage(state: GameState, me: PlayerId): number {
  let mine = 0
  let theirs = 0
  for (const u of Object.values(state.units)) {
    if (u.isAvatar) continue
    const v = effAttack(state, u) + (effDefence(state, u) - u.damage)
    if (u.controller === me) mine += v
    else theirs += v
  }
  const myLife = avatarOf(state, me).life ?? 0
  const opLife = avatarOf(state, enemyOf(me)).life ?? 0
  return mine - theirs + (myLife - opLife)
}

function isAvatarThreatened(state: GameState, me: PlayerId, attacker: UnitState): boolean {
  const avatar = avatarOf(state, me)
  return chebyshev(attacker, avatar) <= 1
}

// ---------- mulligan ----------

function mulliganChoice(state: GameState, me: PlayerId): Action {
  const p = state.players[me]
  const sites = p.hand.filter((id) => getCard(state.cards[id].name).type === 'Site')
  const spells = p.hand.filter((id) => getCard(state.cards[id].name).type !== 'Site')
  if (sites.length === 0 && spells.length > 0) {
    return { t: 'mulligan', back: spells.slice(0, 3) }
  }
  const expensive = spells.filter((id) => (getCard(state.cards[id].name).cost ?? 0) >= 6)
  if (sites.length >= 2 && expensive.length >= 2) {
    return { t: 'mulligan', back: expensive.slice(0, 2) }
  }
  return { t: 'keepHand' }
}

// ---------- main phase ----------

function mainPhase(state: GameState, me: PlayerId, banned?: Set<string>): Action {
  const p = state.players[me]
  const avatar = avatarOf(state, me)
  const enemyAvatar = avatarOf(state, enemyOf(me))
  // anti-loop ward (driver-fed): an action that already proved score-neutral this turn is EXCLUDED,
  // so the ladder falls through to the next-best choice instead of re-picking it forever.
  const ok = (a: Action | null): a is Action => !!a && !(banned?.has(botActionKey(a)))

  // 0. LETHAL SCAN — if a kill line on the enemy avatar exists THIS turn, take
  //    the actions that deliver it, one per call. Public info only (life /
  //    death's door). Cheap: a single board sweep, re-entrant across ticks.
  const lethal = lethalAction(state, me, avatar, enemyAvatar)
  if (ok(lethal) && isLegal(state, me, lethal)) return lethal

  // what can we actually cast right now (excluding sites/avatars)?
  const inHand = p.hand
    .map((id) => ({ id, def: getCard(state.cards[id].name) }))
    .filter(({ def }) => def.type !== 'Site' && def.type !== 'Avatar')

  // 1. develop with the avatar: play a site, or draw one when ramping / short.
  if (!avatar.tapped) {
    const siteCards = p.hand.filter((id) => getCard(state.cards[id].name).type === 'Site')
    if (siteCards.length > 0) {
      const squares = legalSiteSquares(state, me)
      if (squares.length > 0) {
        const best = [...squares].sort((a, b) => chebyshev(a, enemyAvatar) - chebyshev(b, enemyAvatar))[0]
        const play: Action = { t: 'avatarSite', mode: 'play', cardId: siteCards[0], x: best.x, y: best.y }
        if (ok(play)) return play
      }
    } else if (p.atlas.length > 0 && wantMoreSites(state, me, inHand, hasAnyCastable(state, me, inHand))) {
      const draw: Action = { t: 'avatarSite', mode: 'draw' }
      if (ok(draw)) return draw
    }
  }

  // 2. cast — from hand AND cemetery. MINIONS FIRST (board building), then the
  //    rest, biggest of each group first. Each candidate is tried with the best
  //    legal caster (avatar → Spellcaster minion → expansion caster).
  const castCandidates = collectCastable(state, me)
  const byCost = (a: CastCand, b: CastCand) => (b.def.cost ?? 0) - (a.def.cost ?? 0)
  const order = [
    ...castCandidates.filter((c) => c.def.type === 'Minion').sort(byCost),
    ...castCandidates.filter((c) => c.def.type !== 'Minion').sort(byCost),
  ]
  for (const cand of order) {
    const action = tryCast(state, me, cand)
    if (ok(action) && isLegal(state, me, action)) return action
  }

  // 3. activated abilities — units / sites / artifacts with a clearly-good use.
  const ab = tryActivateAbilities(state, me)
  if (ok(ab) && isLegal(state, me, ab)) return ab

  // 4. fight — each ready unit (units + avatar aggression with a safety valve).
  for (const u of Object.values(state.units)) {
    if (u.controller !== me || !canTap(state, u) || isDisabled(state, u)) continue
    const action = unitTurn(state, me, u, enemyAvatar)
    if (ok(action)) return action
  }

  // 5. death's-door defense: get the avatar to the safest reachable square.
  if (avatar.deathsDoor && !isDisabled(state, avatar) && canTap(state, avatar)) {
    const here = avatarDanger(state, me, avatar)
    if (here > 0) {
      const safe = reachableLocations(state, avatar)
        .map((loc) => ({ loc, d: avatarDanger(state, me, loc) }))
        .sort((a, b) => a.d - b.d)[0]
      if (safe && safe.d < here) {
        const path = findPath(state, avatar, safe.loc)
        if (path && path.length) { const mv: Action = { t: 'moveAttack', unitId: avatar.id, path }; if (ok(mv)) return mv }
      }
    }
  }

  // 6. NEVER end the turn with an untapped avatar (owner rule): an unspent avatar
  //    tap is a wasted resource — dump it into "tap: draw a site" before passing.
  //    (Steps 0-5 already had their chance to use the tap for something better.)
  if (!avatar.tapped && canTap(state, avatar) && !isDisabled(state, avatar) && p.atlas.length > 0) {
    const draw: Action = { t: 'avatarSite', mode: 'draw' }
    if (ok(draw)) return draw
  }

  return { t: 'endTurn' }
}

// ---------- lethal scan ----------

/** the enemy avatar's remaining effective toughness for a kill THIS turn:
 *  at death's door ANY 1 damage wins; otherwise it takes eDef-damage to floor it. */
function enemyAvatarKillNeed(state: GameState, enemyAvatar: UnitState): number {
  if (enemyAvatar.deathsDoor) return 1
  return Math.max(1, effDefence(state, enemyAvatar) - enemyAvatar.damage)
}

/**
 * Look for a single action that contributes to killing the enemy avatar this
 * turn. Returns the FIRST such action (melee reach, ranged shot, damage spell,
 * or a damage ability aimed at the avatar). Called first every tick, so a lethal
 * sequence is played out one action per call. Conservative: only fires when the
 * action actually reaches / targets the enemy avatar and does real damage.
 *
 * "Lethal" throughout this section means DEATH BLOW (finishing the avatar with
 * real damage) — NOT the Lethal keyword, which kills minions only and never
 * affects avatars. Keyword-Lethal is intentionally absent from every avatar
 * computation in this file.
 */
function lethalAction(state: GameState, me: PlayerId, avatar: UnitState, enemyAvatar: UnitState): Action | null {
  const need = enemyAvatarKillNeed(state, enemyAvatar)
  const atDoor = !!enemyAvatar.deathsDoor
  // Only bother with the fuller scan when a realistic kill window is open: the
  // avatar is at death's door, or our reachable/ranged/spell damage this turn is
  // plausibly >= need. Melee lethal is already handled by unitTurn's 100000, but
  // we surface it here too so it strictly precedes development.

  // a) a ready melee attacker that can reach and damage the avatar
  for (const u of Object.values(state.units)) {
    if (u.controller !== me || !canTap(state, u) || isDisabled(state, u)) continue
    const kw = effKeywords(state, u)
    const pow = effAttack(state, u)
    if (pow < 1) continue
    // ranged shot lining up on the avatar
    if (kw.ranged && lineHitsEnemyAvatar(state, me, u, kw.ranged ?? 1)) {
      const dir = avatarShotDir(state, me, u, kw.ranged ?? 1)
      if (dir) return { t: 'activate', sourceId: u.id, ability: 'ranged', extra: { direction: dir } }
    }
    // melee reach onto the avatar's square (respect airborne)
    const ekw = effKeywords(state, enemyAvatar)
    if (ekw.airborne && !kw.airborne && enemyAvatar.region === 'surface') continue
    const reach = [{ x: u.x, y: u.y, region: u.region }, ...reachableLocations(state, u)]
    const spot = reach.find((loc) => loc.x === enemyAvatar.x && loc.y === enemyAvatar.y && loc.region === enemyAvatar.region)
    if (spot && (atDoor ? pow >= 1 : pow >= need)) {
      const path = spot.x === u.x && spot.y === u.y && spot.region === u.region ? [] : findPath(state, u, spot)
      if (path !== null) return { t: 'moveAttack', unitId: u.id, path, attack: { unit: enemyAvatar.id } }
    }
  }

  // b) a castable damage spell / projectile that targets the enemy avatar
  for (const cand of collectCastable(state, me)) {
    if (cand.def.type !== 'Magic') continue
    const script = getScript(cand.def.name)
    if (script?.shootsProjectile) {
      const caster = state.units[cand.casterId] ?? avatar
      const dir = bestProjectileDir(state, me, caster)
      if (dir && projectileHitsEnemyAvatar(state, me, caster, dir)) {
        return { t: 'castSpell', cardId: cand.id, casterId: cand.casterId, extra: { direction: dir }, targets: [] }
      }
      continue
    }
    // a targeted damage spell whose spec can pick the enemy avatar
    if (looksLikeDamageSpell(cand.def) && script?.targets?.length) {
      const caster = state.units[cand.casterId] ?? avatar
      const targets = resolveTargetsPreferAvatar(state, me, script.targets, caster, enemyAvatar)
      if (targets) return { t: 'castSpell', cardId: cand.id, casterId: cand.casterId, targets }
    }
  }

  // c) a damage ability aimed at the enemy avatar
  const dmgAbility = damageAbilityAtAvatar(state, me, enemyAvatar)
  if (dmgAbility) return dmgAbility

  return null
}

function looksLikeDamageSpell(def: ReturnType<typeof getCard>): boolean {
  return /(damage|deal \d|strike|deals? \d)/i.test(def.text)
}

/** try to build a targets[] for the given specs that puts the enemy avatar in a
 *  hostile slot; returns null if the avatar can't be legally chosen. */
function resolveTargetsPreferAvatar(
  state: GameState,
  me: PlayerId,
  specs: any[],
  caster: UnitState,
  enemyAvatar: UnitState,
): string[] | null {
  const targets: string[] = []
  let hitAvatar = false
  for (const spec of specs) {
    for (let i = 0; i < spec.count; i++) {
      if ((spec.owner === 'enemy' || spec.owner === 'any' || spec.owner === undefined) &&
          (spec.what === 'unit' || spec.what === 'avatar' || spec.what === 'minion')) {
        if (spec.what !== 'minion' && targetOk(state, me, spec, caster, enemyAvatar)) {
          targets.push(enemyAvatar.id)
          hitAvatar = true
          continue
        }
      }
      const pick = pickTargetFor(state, me, spec, caster)
      if (!pick) {
        if (spec.upTo) continue
        return null
      }
      targets.push(pick)
    }
  }
  return hitAvatar ? targets : null
}

/** does the enemy avatar satisfy a hostile target spec from this caster? */
function targetOk(state: GameState, me: PlayerId, spec: any, caster: UnitState, enemyAvatar: UnitState): boolean {
  if (spec.owner === 'ally') return false
  if (spec.targeted && (enemyAvatar.region !== caster.region || enemyAvatar.stealth)) return false
  if (spec.where === 'nearby' && chebyshev(enemyAvatar, caster) > 1) return false
  if (spec.where === 'adjacent' && chebyshev(enemyAvatar, caster) > 1) return false
  if (spec.where === 'here' && (enemyAvatar.x !== caster.x || enemyAvatar.y !== caster.y)) return false
  try {
    if (spec.filter && !spec.filter(state, enemyAvatar, caster)) return false
  } catch {
    return false
  }
  return true
}

// ---------- casting (caster selection, hand + cemetery) ----------

type CastCand = { id: string; def: ReturnType<typeof getCard>; casterId: string; casterIds: string[]; fromCemetery: boolean }

/** every card the bot can legally cast right now, each paired with ALL legal
 *  casters (avatar first, then Spellcaster/expansion minions). tryCast walks the
 *  caster list so a spell whose targets are unreachable from the avatar still
 *  gets cast by a minion who CAN reach them (the 7 expansion spells, Kiss of
 *  Death from an Undead next to the target, etc.). */
function collectCastable(state: GameState, me: PlayerId): CastCand[] {
  const p = state.players[me]
  const avatar = avatarOf(state, me)
  const out: CastCand[] = []
  const controlled = Object.values(state.units).filter((u) => u.controller === me && !isDisabled(state, u))

  const consider = (id: string, fromCemetery: boolean) => {
    const card = state.cards[id]
    if (!card) return
    const def = getCard(card.name)
    if (def.type === 'Site' || def.type === 'Avatar') return
    const casterIds: string[] = []
    if (canCast(state, me, id, avatar.id).ok) casterIds.push(avatar.id)
    // only scan minion casters when the avatar fails, OR when the spell targets
    // something (a minion caster may reach a target the avatar can't).
    const hasTargets = (getScript(def.name)?.targets?.length ?? 0) > 0 ||
      (getScript(def.name)?.genesisTargets?.length ?? 0) > 0 || def.type === 'Aura' || def.type === 'Minion'
    if (casterIds.length === 0 || hasTargets) {
      for (const u of controlled) {
        if (u.id === avatar.id) continue
        if (canCast(state, me, id, u.id).ok) casterIds.push(u.id)
      }
    }
    if (casterIds.length) out.push({ id, def, casterId: casterIds[0], casterIds, fromCemetery })
  }

  for (const id of p.hand) consider(id, false)
  for (const id of p.cemetery) {
    if (getScript(state.cards[id]?.name ?? '')?.castFromCemetery) consider(id, true)
  }
  return out
}

function hasAnyCastable(state: GameState, me: PlayerId, inHand: { def: any }[]): boolean {
  const avatar = avatarOf(state, me)
  const p = state.players[me]
  return p.hand.some((id) => {
    const d = getCard(state.cards[id].name)
    return d.type !== 'Site' && d.type !== 'Avatar' && canCast(state, me, id, avatar.id).ok
  })
}

function tryCast(state: GameState, me: PlayerId, cand: CastCand): Action | null {
  // walk every legal caster; return the first fully-resolvable cast. The avatar
  // is first, so a minion caster is only used when the avatar can't satisfy the
  // spell's targets (unreachable) — this is what makes the expansion spells fire.
  for (const casterId of cand.casterIds) {
    const action = tryCastWith(state, me, cand, casterId)
    if (action) return action
  }
  return null
}

function tryCastWith(state: GameState, me: PlayerId, cand: CastCand, casterId: string): Action | null {
  const avatar = avatarOf(state, me)
  const enemyAvatar = avatarOf(state, enemyOf(me))
  const caster = state.units[casterId] ?? avatar
  const name = cand.def.name
  const type = cand.def.type
  const script = getScript(name)

  if (type === 'Minion') {
    if (script?.oversized) return null // skip 2x2 placement puzzles
    return castMinion(state, me, cand, caster, avatar, enemyAvatar, casterId)
  }

  if (type === 'Artifact') {
    return castArtifact(state, me, cand, caster, avatar, casterId)
  }

  if (type === 'Aura') {
    return castAura(state, me, cand, caster, casterId)
  }

  if (type === 'Magic') {
    if (name === 'Chaos Twister') return null // whirl the bot can't meaningfully aim
    let candidate: Action | null = null
    if (script?.shootsProjectile) {
      const dir = bestProjectileDir(state, me, caster)
      candidate = dir ? { t: 'castSpell', cardId: cand.id, casterId, extra: { direction: dir }, targets: [] } : null
    } else {
      const specs = script?.targets ?? []
      if (specs.length === 0) {
        candidate = script?.onCast ? { t: 'castSpell', cardId: cand.id, casterId } : null
      } else {
        const targets: string[] = []
        let ok = true
        for (const spec of specs) {
          for (let i = 0; i < spec.count; i++) {
            const pick = pickTargetFor(state, me, spec, caster)
            if (!pick) {
              if (spec.upTo) continue
              ok = false
              break
            }
            targets.push(pick)
          }
          if (!ok) break
        }
        candidate = ok ? { t: 'castSpell', cardId: cand.id, casterId, targets } : null
      }
    }
    if (!candidate) return null
    // USEFULNESS GATE: only cast a Magic that has a beneficial battlefield effect
    // THIS turn (removal, damage, disable/move, or new ally permanents / an opened
    // attack). A buff/inert cast that does nothing is left unplayed.
    return magicIsBeneficial(state, me, candidate) ? candidate : null
  }

  return null
}

/** Board-level BENEFIT to `me` from casting `action` this turn, dry-run on a clone.
 *  Beneficial = we gain minions/artifacts/auras, kill/steal enemy minions, damage the
 *  enemy avatar, destroy enemy auras/artifacts, permanently damage/disable/move enemy
 *  minions (out of a defense), OR open a new profitable attack for one of our units.
 *  Returns false for a buff/inert cast that changes nothing useful this turn. */
function magicIsBeneficial(state: GameState, me: PlayerId, action: Action): boolean {
  let after: GameState
  try { after = structuredClone(state) } catch { return true } // can't verify → don't block
  try { if (!applyAction(after, me, action).ok) return false } catch { return false }
  const opp = enemyOf(me)

  // new ALLY permanents (summoned minions / conjured artifacts / created auras).
  const allyUnitsB = Object.values(state.units).filter((u) => u.controller === me).length
  const allyUnitsA = Object.values(after.units).filter((u) => u.controller === me).length
  if (allyUnitsA > allyUnitsB) return true
  const allyArtB = Object.values(state.artifacts).filter((a) => (a.carriedBy ? state.units[a.carriedBy]?.controller : a.conjuredBy) === me).length
  const allyArtA = Object.values(after.artifacts).filter((a) => (a.carriedBy ? after.units[a.carriedBy]?.controller : a.conjuredBy) === me).length
  if (allyArtA > allyArtB) return true
  const myAuraB = Object.values(state.auras).filter((r) => r.controller === me).length
  const myAuraA = Object.values(after.auras).filter((r) => r.controller === me).length
  if (myAuraA > myAuraB) return true

  // damage to the ENEMY AVATAR.
  const eavB = avatarOf(state, opp)
  const eavA = after.units[eavB.id]
  if (!eavA || (eavA.life ?? 0) < (eavB.life ?? 0) || (eavA.damage > eavB.damage)) return true

  // enemy MINIONS killed / stolen, newly damaged, silenced/disabled, or MOVED.
  for (const u of Object.values(state.units)) {
    if (u.controller !== opp || u.isAvatar) continue
    const a = after.units[u.id]
    if (!a) return true // died
    if (a.controller === me) return true // stolen/transformed to our control
    if (a.damage > u.damage) return true // permanent damage this turn
    if (!u.silenced && a.silenced) return true // disabled/silenced
    if (a.x !== u.x || a.y !== u.y || a.region !== u.region) return true // moved (hinder/pull)
  }

  // enemy AURAS / ARTIFACTS destroyed.
  for (const r of Object.values(state.auras)) {
    if (r.controller === opp && !after.auras[r.id]) return true
  }
  for (const a of Object.values(state.artifacts)) {
    const ctrl = a.carriedBy ? state.units[a.carriedBy]?.controller : a.conjuredBy
    if (ctrl === opp && !after.artifacts[a.id]) return true
  }

  // did the cast OPEN a new profitable attack for one of our ready units? (buff that
  // lets a minion now kill / reach the enemy avatar / an unguarded site, or an enemy
  // dragged into our killing range). Compare best available attack value before/after.
  if (bestAttackValue(after, me) > bestAttackValue(state, me)) return true

  return false
}

/** total offensive potential of our ready units RIGHT NOW: for each, the highest
 *  attack power it can land on a reachable enemy unit / avatar / site this turn (0 if
 *  it can reach none). A buff that raises a striker's power, an enemy pulled into
 *  range, or a unit freed to reach a target all INCREASE this — the signal the magic
 *  gate uses to detect a cast that opens or strengthens an attack this turn. */
function bestAttackValue(state: GameState, me: PlayerId): number {
  let total = 0
  for (const u of Object.values(state.units)) {
    if (u.controller !== me || !canTap(state, u) || isDisabled(state, u)) continue
    const kw = effKeywords(state, u)
    const pow = effAttack(state, u)
    if (pow <= 0 && !kw.lethal) continue
    const reach = [{ x: u.x, y: u.y, region: u.region }, ...reachableLocations(state, u)]
    let best = 0
    for (const loc of reach) {
      // an enemy unit / avatar we can strike here.
      for (const e of unitsAt(state, loc.x, loc.y, loc.region as any)) {
        if (e.controller === me || e.stealth) continue
        const ekw = effKeywords(state, e)
        if (ekw.airborne && !kw.airborne && e.region === 'surface') continue
        best = Math.max(best, pow + (e.isAvatar ? 2 : 0))
      }
      // an enemy site we can raze here.
      if (loc.region === 'surface') {
        for (const s of Object.values(state.sites)) {
          if (s.isRubble || s.controller === null || s.controller === me) continue
          if (s.x === loc.x && s.y === loc.y) best = Math.max(best, pow)
        }
      }
    }
    total += best
  }
  return total
}

type SummonSpot = { x: number; y: number; region: 'surface' | 'underwater' | 'underground' | 'void' }

/** a stand-in UnitState for the minion `name` as if it stood at `spot` — lets us
 *  probe its effective keywords (voidwalk/burrowing/submerge/ranged/lethal) and
 *  compute reach from a hypothetical summon square, without it existing yet. */
function summonProbe(state: GameState, me: PlayerId, name: string, spot: SummonSpot): UnitState {
  return {
    id: '__probe__', cardId: '', name, owner: me, controller: me, isAvatar: false,
    x: spot.x, y: spot.y, region: spot.region, tapped: false, damage: 0,
    enteredTurn: state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
  } as unknown as UnitState
}

/** the opponent's half of the board = the GRID_H/2 rows nearest the enemy avatar.
 *  With a 5x4 grid that's the 10 squares on the enemy's two rows. */
function inOpponentHalf(sq: { y: number }, enemyAvatar: UnitState): boolean {
  // enemy avatar sits on y=0 or y=3; their half is the two rows on that end.
  return enemyAvatar.y <= 1 ? sq.y <= 1 : sq.y >= 2
}

/** Is a summoned minion NEEDED to defend an otherwise-unguarded AND threatened
 *  allied site? True when we have a site with no allied unit on it that an enemy can
 *  reach this/next turn AND a body of `defenderDef` toughness could actually hold it
 *  (a chump that would be one-shot for no gain is NOT a real defender). */
function neededForSiteDefense(state: GameState, me: PlayerId, defenderDef = 1): boolean {
  const undef = ourUndefendedSites(state, me)
  if (!undef.length) return false
  return Object.values(state.units).some((e) => {
    if (e.controller === me || isDisabled(state, e) || effAttack(state, e) <= 0) return false
    // a would-be defender that dies to this attacker's single strike can't guard.
    if (effAttack(state, e) >= defenderDef) return false
    const mv = 1 + (effKeywords(state, e).movement ?? 0)
    return undef.some((s) => chebyshev(e, s) <= mv + 1)
  })
}

/** Does a minion summoned SUBSURFACE at `spot` have a path to attack the opponent
 *  WITHOUT emerging? A Ranged subsurface unit that already lines up on an enemy in
 *  its region, or one whose reachable subsurface squares put it onto an attackable
 *  enemy unit/avatar/site (all in the SAME region — no surfacing). */
function subsurfaceAttackPath(state: GameState, me: PlayerId, name: string, spot: SummonSpot): boolean {
  const probe = summonProbe(state, me, name, spot)
  const kw = effKeywords(state, probe)
  const pow = effAttack(state, probe)
  if (pow < 1 && !kw.lethal) return false
  // reachable squares (respects region-legal steps) plus the summon square itself.
  const reach = [{ x: spot.x, y: spot.y, region: spot.region }, ...reachableLocations(state, probe)]
  for (const loc of reach) {
    if (loc.region !== spot.region) continue // must stay subsurface (no emerging)
    // an enemy unit co-located in the same region is attackable in melee.
    if (unitsAt(state, loc.x, loc.y, loc.region as any).some((u) => u.controller !== me && !u.stealth)) return true
    // a ranged shot down a line from this square that hits an enemy in-region.
    if (kw.ranged) {
      const shooter = atLoc(probe, loc)
      for (const dir of ['n', 's', 'e', 'w'] as const) {
        const dx = dir === 'e' ? 1 : dir === 'w' ? -1 : 0
        const dy = dir === 'n' ? 1 : dir === 's' ? -1 : 0
        for (let step = 1; step <= (kw.ranged ?? 1); step++) {
          const x = shooter.x + dx * step
          const y = shooter.y + dy * step
          if (x < 0 || x > 4 || y < 0 || y > 3) break
          const here = unitsAt(state, x, y, spot.region as any).filter((t) => !t.stealth)
          if (here.length) { if (here.some((t) => t.controller !== me)) return true; break }
        }
      }
    }
  }
  return false
}

/** Would summoning this minion at `spot` (with `targets`) immediately KILL an enemy
 *  minion? Dry-runs the cast on a clone and checks whether any enemy minion that was
 *  present before is gone after (Lacuna Entity & any genesis/on-enter removal). */
function summonKillsEnemyMinion(state: GameState, me: PlayerId, action: Action): boolean {
  const before = new Set(
    Object.values(state.units).filter((u) => u.controller !== me && !u.isAvatar).map((u) => u.id),
  )
  if (!before.size) return false
  let clone: GameState
  try { clone = structuredClone(state) } catch { return false }
  try { if (!applyAction(clone, me, action).ok) return false } catch { return false }
  for (const id of before) {
    const a = clone.units[id]
    if (!a || a.controller === me) return true // died, or was stolen (still a removal)
  }
  return false
}

/** resolve genesis targets for a summon of `name` at `spot`. By default only the
 *  MANDATORY targets are filled (optional `upTo` specs are skipped), returning null
 *  if a required target can't be satisfied. With `includeOptional`, optional specs
 *  are ALSO filled when a legal pick exists — used to detect a summon whose optional
 *  genesis removal (Lacuna Entity's "weaker adjacent minion") kills an enemy. */
function genesisTargetsAt(
  state: GameState, me: PlayerId, name: string, caster: UnitState, spot: SummonSpot, includeOptional = false,
): string[] | null {
  const gt = getScript(name)?.genesisTargets ?? []
  const atSpot = atLoc(caster, spot)
  const targets: string[] = []
  for (const spec of gt) {
    for (let i = 0; i < spec.count; i++) {
      const pick = pickTargetFor(state, me, spec, atSpot)
      if (!pick) {
        if (spec.upTo) break // optional: nothing legal to pick → leave it empty
        return null
      }
      if (spec.upTo && !includeOptional) break // skip optional targets unless asked
      targets.push(pick)
    }
  }
  return targets
}

function castMinion(
  state: GameState,
  me: PlayerId,
  cand: CastCand,
  caster: UnitState,
  avatar: UnitState,
  enemyAvatar: UnitState,
  casterId: string,
): Action | null {
  const name = cand.def.name
  // Probe effective keywords (grants/statics), falling back to card text.
  const surfaceProbe = summonProbe(state, me, name, { x: caster.x, y: caster.y, region: 'surface' })
  const pkw = effKeywords(state, surfaceProbe)
  const canSubmerge = !!pkw.submerge || /(^|\n|\b)submerge\b/i.test(cand.def.text)
  const canBurrow = !!pkw.burrowing || /(^|\n|\b)burrowing\b/i.test(cand.def.text)
  const canVoidwalk = !!pkw.voidwalk || /(^|\n|\b)voidwalk\b/i.test(cand.def.text)
  const hasLethal = !!pkw.lethal || /(^|\n|\b)lethal\b/i.test(cand.def.text)
  const power1Lethal = hasLethal && (cand.def.attack ?? effAttack(state, surfaceProbe)) === 1
  const subRegion: 'underwater' | 'underground' | null = canSubmerge ? 'underwater' : canBurrow ? 'underground' : null

  // enumerate legal surface / subsurface / void spots.
  const surfaceSpots: SummonSpot[] = []
  const subSpots: SummonSpot[] = []
  const voidSpots: SummonSpot[] = []
  for (const s of Object.values(state.sites)) {
    if (validateSummonAt(state, me, name, { x: s.x, y: s.y, region: 'surface' }) === null) {
      surfaceSpots.push({ x: s.x, y: s.y, region: 'surface' })
    }
    if (subRegion && validateSummonAt(state, me, name, { x: s.x, y: s.y, region: subRegion }) === null) {
      subSpots.push({ x: s.x, y: s.y, region: subRegion })
    }
  }
  if (canVoidwalk) {
    // void squares have NO site; scan the whole grid for legal void summons.
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 4; y++) {
        if (validateSummonAt(state, me, name, { x, y, region: 'void' }) === null) {
          voidSpots.push({ x, y, region: 'void' })
        }
      }
    }
  }
  if (!surfaceSpots.length && !subSpots.length && !voidSpots.length) return null

  // shield the avatar when it's at death's door, else press toward the enemy avatar.
  const wantShield = avatar.deathsDoor
  const anchor = wantShield ? avatar : enemyAvatar
  const byNearAnchor = (a: SummonSpot, b: SummonSpot) => chebyshev(a, anchor) - chebyshev(b, anchor)
  const nearestAvatar = (spots: SummonSpot[]) =>
    [...spots].sort((a, b) => chebyshev(a, enemyAvatar) - chebyshev(b, enemyAvatar))[0]

  const finish = (spot: SummonSpot): Action | null => {
    const targets = genesisTargetsAt(state, me, name, caster, spot)
    if (targets === null) return null
    return { t: 'castSpell', cardId: cand.id, casterId, at: { x: spot.x, y: spot.y, region: spot.region }, targets }
  }

  // ---- B) VOIDWALK: cast in the void, as close to the enemy avatar as possible,
  //        unless needed for site defense or there is no void in the opponent's half.
  if (canVoidwalk && voidSpots.length && !wantShield) {
    const offensiveVoid = voidSpots.filter((s) => inOpponentHalf(s, enemyAvatar))
    if (offensiveVoid.length && !neededForSiteDefense(state, me, effDefence(state, surfaceProbe))) {
      const spot = nearestAvatar(offensiveVoid)
      const a = finish(spot)
      if (a) return a
    }
  }

  const bestSurface = surfaceSpots.length ? [...surfaceSpots].sort(byNearAnchor)[0] : null

  // a surface spot is "safe" if the minion wouldn't just die there this turn.
  const myDef = effDefence(state, surfaceProbe)
  const safeSurfaceExists = surfaceSpots.some((s) => avatarDanger(state, me, s) < myDef)

  // ---- A) SUBSURFACE: only go under when one of the requirements holds; otherwise
  //        surface is the aggressive default.
  if (subRegion && subSpots.length && !wantShield) {
    const bestSub = [...subSpots].sort(byNearAnchor)[0]
    const needForDefense = neededForSiteDefense(state, me, myDef)
    // A.4: a burrowed/submerged summon that immediately kills an enemy minion via its
    //      genesis/on-enter removal (Lacuna Entity). Resolve OPTIONAL genesis targets
    //      too, then dry-run the cast and see if an enemy minion dies.
    let killSubAction: Action | null = null
    for (const spot of subSpots) {
      const targets = genesisTargetsAt(state, me, name, caster, spot, true)
      if (targets === null) continue
      const a: Action = { t: 'castSpell', cardId: cand.id, casterId, at: { x: spot.x, y: spot.y, region: spot.region }, targets }
      if (summonKillsEnemyMinion(state, me, a)) { killSubAction = a; break }
    }
    const goSub =
      // A.1: not needed to defend, AND can attack without emerging.
      (!needForDefense && subSpots.some((spot) => subsurfaceAttackPath(state, me, name, spot))) ||
      // A.2: power-1 Lethal picker.
      power1Lethal ||
      // A.3: Root Spider by name.
      name === 'Root Spider' ||
      // A.4: kills an enemy minion on the way in.
      killSubAction != null ||
      // no surface option at all → subsurface is the only legal placement.
      !bestSurface ||
      // survival tie-breaker (NOT the default): every surface spot would get the
      // minion killed for no gain, but a subsurface spot keeps the body alive.
      (!safeSurfaceExists && !needForDefense)
    if (goSub) {
      if (killSubAction) return killSubAction
      const spot = bestSurface ? bestSub : nearestAvatar(subSpots)
      const a = finish(spot)
      if (a) return a
    }
  }

  // ---- default: SURFACE, pressing toward the enemy avatar. Avoid a spot that just
  //        gets the minion killed for no gain when a safer surface spot exists.
  if (bestSurface) {
    const safeSurface = safeSurfaceExists
      ? [...surfaceSpots].filter((s) => avatarDanger(state, me, s) < myDef).sort(byNearAnchor)[0]
      : null
    const a = finish(safeSurface ?? bestSurface)
    if (a) return a
  }

  // fall back to any remaining legal spot so the minion still hits the board.
  for (const spot of [...subSpots, ...voidSpots].sort(byNearAnchor)) {
    const a = finish(spot)
    if (a) return a
  }
  return null
}

function castArtifact(state: GameState, me: PlayerId, cand: CastCand, caster: UnitState, avatar: UnitState, casterId: string): Action | null {
  const name = cand.def.name
  const script = getScript(name)
  const subs = cand.def.subtypes ?? []
  const isGear = subs.includes('Weapon') || subs.includes('Armor')

  // Weapons/armor go to the strongest allied frontline minion (closest to the
  // enemy), else the avatar. Relics/Devices with abilities → avatar by default.
  if (isGear) {
    const enemyAvatar = avatarOf(state, enemyOf(me))
    const minions = Object.values(state.units).filter(
      (u) => u.controller === me && !u.isAvatar && !isDisabled(state, u) && u.carrying.length < 2,
    )
    if (minions.length) {
      // frontline = highest attack, tie-break closer to the enemy avatar
      const best = [...minions].sort((a, b) => {
        const d = effAttack(state, b) - effAttack(state, a)
        if (d !== 0) return d
        return chebyshev(a, enemyAvatar) - chebyshev(b, enemyAvatar)
      })[0]
      return { t: 'castSpell', cardId: cand.id, casterId, extra: { giveTo: best.id } }
    }
  }

  // artifacts that must be conjured on a site (no bearer): place on our site
  // closest to the enemy. Prefer giveTo (works for most gear/relics), and use a
  // ground placement for Monuments / conjure-filtered artifacts.
  const giveToAction: Action = { t: 'castSpell', cardId: cand.id, casterId, extra: { giveTo: avatar.id } }
  // if the artifact declares a conjure filter or looks like a Monument/Device
  // that sits on the ground, place it on a site instead.
  const groundOnly = subs.includes('Monument') || !!script?.conjureFilter
  if (groundOnly) {
    const enemyAvatar = avatarOf(state, enemyOf(me))
    const mySites = Object.values(state.sites).filter((s) => s.controller === me && !s.isRubble)
    const spot = [...mySites].sort((a, b) => chebyshev(a, enemyAvatar) - chebyshev(b, enemyAvatar))[0]
    if (spot) return { t: 'castSpell', cardId: cand.id, casterId, at: { x: spot.x, y: spot.y } }
  }
  return giveToAction
}

function castAura(state: GameState, me: PlayerId, cand: CastCand, caster: UnitState, casterId: string): Action | null {
  const name = cand.def.name
  const hostile = isHostileAura(cand.def)
  // an aura occupies a 2x2 area anchored at `at`. For a hostile aura, anchor over
  // the densest ENEMY cluster; for a buff aura, over our densest cluster. Respect
  // any auraPlacement restriction by scanning legal anchors first.
  const placement = getScript(name)?.auraPlacement
  const candidates: { x: number; y: number }[] = []
  for (let x = 0; x < 4; x++) {
    for (let y = 0; y < 3; y++) {
      if (placement) {
        try {
          if (placement(state, me, { x, y }) !== null) continue
        } catch {
          continue
        }
      }
      candidates.push({ x, y })
    }
  }
  if (!candidates.length) {
    // some auras anchor anywhere on the 5x4 grid (no 2x2 clip); try each square
    for (let x = 0; x < 5; x++) for (let y = 0; y < 4; y++) candidates.push({ x, y })
  }
  const density = (anchor: { x: number; y: number }, wantEnemy: boolean): number => {
    let n = 0
    for (let dx = 0; dx <= 1; dx++) {
      for (let dy = 0; dy <= 1; dy++) {
        for (const u of unitsAt(state, anchor.x + dx, anchor.y + dy)) {
          const isEnemy = u.controller !== me
          if (isEnemy === wantEnemy) n += 1 + (u.isAvatar ? 1 : 0)
        }
      }
    }
    return n
  }
  const best = [...candidates].sort((a, b) => density(b, hostile) - density(a, hostile))[0]
  if (!best) return null
  if (hostile && density(best, true) === 0) return null // no enemies to blanket → skip
  return { t: 'castSpell', cardId: cand.id, casterId, at: { x: best.x, y: best.y } }
}

function isHostileAura(def: ReturnType<typeof getCard>): boolean {
  return /(enemy|opponent|damage|each unit|all minions|weaker|-\d|cannot)/i.test(def.text) &&
    !/(your (units|minions)|allied|you control)/i.test(def.text)
}

function pickTargetFor(state: GameState, me: PlayerId, spec: any, caster: UnitState): string | null {
  if (spec.what === 'square') {
    let best: { x: number; y: number } | null = null
    let bestScore = 0
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 4; y++) {
        if (spec.targeted && chebyshev({ x, y }, caster) > 2) continue
        const at = unitsAt(state, x, y, caster.region)
        const enemies = at.filter((u) => u.controller !== me).length
        const allies = at.filter((u) => u.controller === me).length
        const hasEnemyAvatar = at.some((u) => u.isAvatar && u.controller !== me)
        const score = enemies - allies + (hasEnemyAvatar ? 5 : 0)
        if (score > bestScore) {
          bestScore = score
          best = { x, y }
        }
      }
    }
    return best ? `sq:${best.x},${best.y},${caster.region}` : null
  }
  if (spec.what === 'site') {
    // mirror validateTargetCore's site rules: owner, where, and the spec filter.
    const pool = Object.values(state.sites).filter((s) => {
      if (s.isRubble) return false
      if (spec.owner === 'ally' && s.controller !== me) return false
      if (spec.owner === 'enemy' && (s.controller === me || s.controller === null)) return false
      if (spec.where === 'nearby' && chebyshev(s, caster) > 1) return false
      if (spec.where === 'adjacent' && chebyshev(s, caster) > 1) return false
      if (spec.where === 'here' && (s.x !== caster.x || s.y !== caster.y)) return false
      try {
        if (spec.filter && !spec.filter(state, s, caster)) return false
      } catch {
        return false
      }
      return true
    })
    if (!pool.length) return null
    // prefer an enemy site (resource denial); else the first legal (e.g. own site).
    const enemySite = pool.find((s) => s.controller !== null && s.controller !== me)
    return (enemySite ?? pool[0]).id
  }
  const candidates = (Object.values(state.units) as UnitState[]).filter((u) => {
    if ((spec.what === 'minion' || spec.what === 'minionOrArtifact') && u.isAvatar) return false
    if (spec.what === 'avatar' && !u.isAvatar) return false
    if (spec.owner === 'ally' && u.controller !== me) return false
    if (spec.owner === 'enemy' && u.controller === me) return false
    if (spec.targeted && (u.region !== caster.region || (u.stealth && u.controller !== me))) return false
    if (spec.where === 'nearby' && chebyshev(u, caster) > 1) return false
    if (spec.where === 'adjacent' && chebyshev(u, caster) > 1) return false
    if (spec.where === 'here' && (u.x !== caster.x || u.y !== caster.y)) return false
    try {
      if (spec.filter && !spec.filter(state, u, caster)) return false
    } catch {
      return false
    }
    return true
  })
  if (!candidates.length) return null
  if (spec.owner === 'ally') {
    return candidates.sort((a, b) => effAttack(state, b) - effAttack(state, a))[0].id
  }
  const enemies = candidates.filter((u) => u.controller !== me)
  if (enemies.length) {
    return enemies
      .map((u) => ({ u, s: scoreDamageTarget(state, me, u, 3) }))
      .sort((a, b) => b.s - a.s)[0].u.id
  }
  return candidates[0].id
}

// ---------- activated abilities ----------

/** iterate ready sources (units, sites, standalone+carried artifacts) and
 *  activate the first clearly-good ability. Conservative: skip life/self-sac
 *  costs and over-budget mana unless it secures lethal (lethal is handled
 *  separately in lethalAction). */
function tryActivateAbilities(state: GameState, me: PlayerId): Action | null {
  const p = state.players[me]
  const enemyAvatar = avatarOf(state, enemyOf(me))

  type Src = { id: string; name: string; anchor: UnitState }
  const sources: Src[] = []
  for (const u of Object.values(state.units)) {
    if (u.controller === me) sources.push({ id: u.id, name: u.name, anchor: u })
  }
  for (const s of Object.values(state.sites)) {
    if (s.controller === me && !s.isRubble) sources.push({ id: s.id, name: s.name, anchor: siteAnchor(s, me) })
  }
  for (const a of Object.values(state.artifacts)) {
    const controller = a.carriedBy ? state.units[a.carriedBy]?.controller : a.conjuredBy
    if (controller === me) sources.push({ id: a.id, name: a.name, anchor: artifactAnchor(state, a, me) })
  }

  for (const src of sources) {
    const script = getScript(src.name)
    const abilities = script?.abilities ?? []
    for (const ability of abilities) {
      if (ability.key === 'ranged') continue // handled in unitTurn / lethal
      // skip abilities with a life or self-sacrifice cost, or mana beyond spare.
      if (ability.cost?.life || ability.cost?.sacrificeSelf || ability.cost?.discardSpell) continue
      const manaCost = ability.cost?.mana ?? 0
      if (manaCost > 0 && manaCost > p.mana) continue
      if (canActivate(state, me, src.id, ability.key) !== null) continue

      const action = buildAbilityAction(state, me, src.id, ability, src.anchor, enemyAvatar)
      // only use it if it actually changes the game state — an accepted-but-no-op
      // ability (e.g. Corpse Catapult's fling with no second untapped ally here to
      // tap) is legal yet does nothing, so the ~550ms driver would re-pick it
      // forever. Skip it and try the next source/ability instead.
      if (action && actionMakesProgress(state, me, action)) return action
    }
  }
  return null
}

/** decide whether an ability is worth using and, if so, resolve its targets. */
function buildAbilityAction(
  state: GameState,
  me: PlayerId,
  sourceId: string,
  ability: any,
  anchor: UnitState,
  enemyAvatar: UnitState,
): Action | null {
  const specs = ability.targets ?? []
  const label = `${ability.label ?? ''} ${ability.key ?? ''}`.toLowerCase()

  if (specs.length === 0) {
    // no-target ability: activate if it reads beneficial (draw / heal / token /
    // damage / untap). Skip anything that smells like a downside with no target.
    if (/(draw|heal|token|summon|damage|untap|gain|conjure|charge|scry|search)/.test(label)) {
      const at = ability.needsSquare ? { x: anchor.x, y: anchor.y } : undefined
      return { t: 'activate', sourceId, ability: ability.key, targets: [], ...(at ? { at } : {}) }
    }
    // unknown no-target ability: activate only if clearly free (tap-only cost) and
    // its label isn't obviously a self-cost — conservative default is to skip.
    return null
  }

  // has targets: treat enemy-target specs as removal/damage, ally as buff.
  const wantsEnemy = specs.some((s: any) => s.owner === 'enemy' || s.owner === 'any' || s.owner === undefined)
  const targets: string[] = []
  for (const spec of specs) {
    for (let i = 0; i < spec.count; i++) {
      const pick = pickTargetFor(state, me, spec, anchor)
      if (!pick) {
        if (spec.upTo) continue
        return null // can't satisfy → skip this ability
      }
      targets.push(pick)
    }
  }
  if (!targets.length) {
    // an all-optional target ability with nothing worth hitting → skip unless
    // clearly beneficial no-op.
    if (!/(draw|heal|token|untap|gain)/.test(label)) return null
  }
  // only use a hostile ability when there's actually an enemy target picked.
  if (wantsEnemy && targets.length) {
    const hitsEnemy = targets.some((t) => {
      const u = state.units[t.startsWith('u') ? t : '']
      return u && u.controller !== me
    })
    // squares/sites also count as hostile use
    const hitsSquareOrSite = targets.some((t) => t.startsWith('sq:') || state.sites[t])
    if (!hitsEnemy && !hitsSquareOrSite && !/(buff|ally|your)/.test(label)) {
      // fine to proceed for ally-buff specs; for pure hostile with no enemy, skip
      const allyBuff = specs.every((s: any) => s.owner === 'ally')
      if (!allyBuff) return null
    }
  }
  const at = ability.needsSquare ? { x: anchor.x, y: anchor.y } : undefined
  return { t: 'activate', sourceId, ability: ability.key, targets, ...(at ? { at } : {}) }
}

/** find a damage-flavored ability that can target the enemy avatar (for lethal). */
function damageAbilityAtAvatar(state: GameState, me: PlayerId, enemyAvatar: UnitState): Action | null {
  const p = state.players[me]
  const sources: { id: string; name: string; anchor: UnitState }[] = []
  for (const u of Object.values(state.units)) if (u.controller === me) sources.push({ id: u.id, name: u.name, anchor: u })
  for (const s of Object.values(state.sites)) if (s.controller === me && !s.isRubble) sources.push({ id: s.id, name: s.name, anchor: siteAnchor(s, me) })
  for (const a of Object.values(state.artifacts)) {
    const controller = a.carriedBy ? state.units[a.carriedBy]?.controller : a.conjuredBy
    if (controller === me) sources.push({ id: a.id, name: a.name, anchor: artifactAnchor(state, a, me) })
  }
  for (const src of sources) {
    const script = getScript(src.name)
    for (const ability of script?.abilities ?? []) {
      if (ability.key === 'ranged') continue
      if (ability.cost?.life || ability.cost?.sacrificeSelf) continue
      const manaCost = ability.cost?.mana ?? 0
      if (manaCost > p.mana) continue
      const label = `${ability.label ?? ''}`.toLowerCase()
      if (!/(damage|deal|strike|bolt|burn|shot|fire)/.test(label)) continue
      if (canActivate(state, me, src.id, ability.key) !== null) continue
      const specs = ability.targets ?? []
      const targets = resolveTargetsPreferAvatar(state, me, specs, src.anchor, enemyAvatar)
      if (targets) {
        const at = ability.needsSquare ? { x: src.anchor.x, y: src.anchor.y } : undefined
        return { t: 'activate', sourceId: src.id, ability: ability.key, targets, ...(at ? { at } : {}) }
      }
    }
  }
  return null
}

/** a pseudo-unit at a site's square so target ranges anchor on the source. */
function siteAnchor(s: SiteState, me: PlayerId): UnitState {
  return { id: s.id, name: s.name, controller: me, isAvatar: false, x: s.x, y: s.y, region: 'surface', damage: 0, tapped: false, enteredTurn: 0, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {} } as unknown as UnitState
}

function artifactAnchor(state: GameState, a: any, me: PlayerId): UnitState {
  if (a.carriedBy && state.units[a.carriedBy]) return state.units[a.carriedBy]
  return { id: a.id, name: a.name, controller: me, isAvatar: false, x: a.x, y: a.y, region: a.region ?? 'surface', damage: 0, tapped: false, enteredTurn: 0, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {} } as unknown as UnitState
}

// ---------- unit turn (fight incl. SITE ATTACKS + avatar aggression) ----------

function unitTurn(state: GameState, me: PlayerId, u: UnitState, enemyAvatar: UnitState): Action | null {
  const kw = effKeywords(state, u)
  const myPow = effAttack(state, u)
  const reach = [{ x: u.x, y: u.y, region: u.region }, ...reachableLocations(state, u)]
  const myAvatar = avatarOf(state, me)

  // ranged: shoot down the line whose first enemy is the best target.
  if (kw.ranged && myPow > 0) {
    let bestDir: 'n' | 's' | 'e' | 'w' | null = null
    let bestScore = 0
    for (const dir of ['n', 's', 'e', 'w'] as const) {
      const dx = dir === 'e' ? 1 : dir === 'w' ? -1 : 0
      const dy = dir === 'n' ? 1 : dir === 's' ? -1 : 0
      for (let step = 1; step <= (kw.ranged ?? 1); step++) {
        const x = u.x + dx * step
        const y = u.y + dy * step
        if (x < 0 || x > 4 || y < 0 || y > 3) break
        const here = unitsAt(state, x, y, u.region).filter((t) => !t.stealth)
        if (here.length) {
          const enemy = here.find((t) => t.controller !== me)
          if (enemy) {
            const s = scoreDamageTarget(state, me, enemy, myPow)
            if (s > bestScore) { bestScore = s; bestDir = dir }
          }
          break
        }
      }
    }
    if (bestDir) return { t: 'activate', sourceId: u.id, ability: 'ranged', extra: { direction: bestDir } }
  }

  type Plan = { value: number; path: any[]; attack: any; killsEnemyAvatar: boolean }
  const bestRef: { cur: Plan | null } = { cur: null }
  const consider = (value: number, loc: any, attack: any, killsEnemyAvatar = false) => {
    if (value <= 0 || (bestRef.cur && value <= bestRef.cur.value)) return
    const path = loc.x === u.x && loc.y === u.y && loc.region === u.region ? [] : findPath(state, u, loc)
    if (path === null) return
    bestRef.cur = { value, path, attack, killsEnemyAvatar }
  }

  const myAvatarAtDoor = !!myAvatar.deathsDoor
  const cantAttackSites = !!getScript(u.name)?.cantAttackSites && !u.silenced
  for (const loc of reach) {
    // fight enemy UNITS at this square
    for (const enemy of unitsAt(state, loc.x, loc.y, loc.region)) {
      if (enemy.controller === me || enemy.stealth) continue
      const ekw = effKeywords(state, enemy)
      if (ekw.airborne && !kw.airborne && enemy.region === 'surface') continue
      const eDef = effDefence(state, enemy) - enemy.damage
      const ePow = effAttack(state, enemy)
      if (enemy.isAvatar) {
        // NB: the Lethal KEYWORD does not affect avatars (it kills MINIONS only) —
        // a death blow here comes from raw power vs remaining toughness / death's door.
        const deathBlow = enemy.deathsDoor ? myPow >= 1 : myPow >= eDef
        consider(deathBlow ? 100000 : Math.max(1, myPow) * 3, loc, { unit: enemy.id }, deathBlow)
        continue
      }
      // minions only from here down — this is the one place keyword-Lethal applies.
      const kills = myPow >= eDef || !!kw.lethal
      // A pointless attack (non-lethal chip on a minion that heals at end of turn)
      // is only worthwhile if a gang-kill finishes this minion THIS turn.
      if (!kills && !(myPow >= 1 && minionKillableThisTurn(state, me, enemy))) continue
      // model the opponent's likely defensive response at this square: does our
      // attacker die to the target's strike-back plus nearby defenders?
      const retaliation = expectedRetaliation(state, me, loc, enemy)
      const myDef = effDefence(state, u) - u.damage
      const dies = retaliation >= myDef
      // principled score f = B*(cost killed − cost lost) + C*(enemy power removed).
      // avatar-life term is 0 for a minion target. A non-killing blow that is part
      // of a coordinated gang-kill still earns a partial share of the target's
      // value (so a worthwhile coordinated kill isn't suppressed by attacker risk),
      // while a chip that just gets our unit killed nets out negative and is cut.
      const B = 3, C = 1
      const killed = kills ? minionValue(state, enemy) : minionValue(state, enemy) * 0.5
      const lost = dies ? minionValue(state, u) : 0
      const powerRemoved = kills ? ePow : 0
      let value = B * (killed - lost) + C * powerRemoved
      if (kills && !dies) value += 1 // tie-break toward a free kill
      if (myAvatarAtDoor && kills && threatensAvatar(state, me, enemy)) value += 50
      // never suicide a unit for a strictly-worse trade (lose more cost than gained)
      // unless it removes real pressure or is part of a lethal gang-kill line.
      if (value <= 0) continue
      consider(value, loc, { unit: enemy.id })
    }

    // ATTACK enemy SITES at this square (must be on the surface of the site).
    if (myPow > 0 && !cantAttackSites && loc.region === 'surface') {
      for (const site of Object.values(state.sites)) {
        if (site.isRubble || site.controller === null || site.controller === me) continue
        if (site.x !== loc.x || site.y !== loc.y) continue
        const value = scoreSiteAttack(state, me, u, site, loc, myPow)
        if (value > 0) consider(value, loc, { site: site.id })
      }
    }
  }

  const best = bestRef.cur
  if (best) {
    // hold to defend our base if the attack is worth less than the pressure it
    // would leave uncontested (unless it kills the enemy avatar).
    const threat = incomingThreat(state, me)
    const guardingHome = threat > 0 && !u.isAvatar && chebyshev(u, myAvatar) <= 1
    if (guardingHome && !best.killsEnemyAvatar && best.value < threat) return null
    // AVATAR aggression safety valve: only let the avatar commit an attack if it
    // secures lethal, or its expected retaliation is survivable.
    if (u.isAvatar && !best.killsEnemyAvatar) {
      const dest = best.path.length ? best.path[best.path.length - 1] : { x: u.x, y: u.y }
      const danger = avatarDanger(state, me, dest)
      const myDef = effDefence(state, u) - u.damage
      const life = u.life ?? 0
      if (u.deathsDoor) return null // never risk a dying avatar on offense
      if (danger >= myDef + life - 1) return null // retaliation likely fatal → hold
    }
    return { t: 'moveAttack', unitId: u.id, path: best.path, attack: best.attack }
  }

  // no attack found — advance minions toward the enemy avatar (never step onto an
  // enemy site without attacking it).
  if (!u.isAvatar) {
    const closer = reach
      .filter((loc) => chebyshev(loc, enemyAvatar) < chebyshev(u, enemyAvatar))
      .filter((loc) => !Object.values(state.sites).some(
        (s) => s.x === loc.x && s.y === loc.y && !s.isRubble && s.controller !== null && s.controller !== me,
      ))
      .sort((a, b) => chebyshev(a, enemyAvatar) - chebyshev(b, enemyAvatar))[0]
    if (closer) {
      const path = findPath(state, u, closer)
      if (path && path.length) return { t: 'moveAttack', unitId: u.id, path }
    }
  }
  return null
}

/**
 * Value of razing an enemy site: a successful site strike drains the controller's
 * LIFE by the attacker's power (real damage toward death) and denies the site's
 * mana/threshold. Discounted by expected defender retaliation (co-located +
 * adjacent enemy units that could tap to defend and hurt our attacker).
 */
function scoreSiteAttack(
  state: GameState,
  me: PlayerId,
  u: UnitState,
  site: SiteState,
  loc: { x: number; y: number },
  myPow: number,
): number {
  const def = getCardMaybe(site.name)
  // resource-denial: threshold pips + a base for the mana source
  let denial = 2
  if (def) {
    for (const el of REGIONS) denial += (def.thresholds?.[el] ?? 0) * 2
    // deeper in enemy territory usually means a key engine site
    denial += 1
  }
  // life drain is the dominant term: each point of power drains a life point.
  const lifeDrain = myPow * 3
  // expected retaliation: enemy units that can defend this site (same square or
  // adjacent) and would hurt our attacker.
  let retaliation = 0
  for (const e of Object.values(state.units)) {
    if (e.controller === me || isDisabled(state, e)) continue
    if (chebyshev(e, loc) <= 1) retaliation += Math.max(0, effAttack(state, e))
  }
  const myDef = effDefence(state, u) - u.damage
  const dies = retaliation >= myDef
  const value = lifeDrain + denial - (dies ? myPow + 4 : retaliation * 0.5)
  return Math.max(0, value)
}

// ---------- projectile / line helpers ----------

function threatensAvatar(state: GameState, me: PlayerId, enemy: UnitState): boolean {
  const av = avatarOf(state, me)
  const mv = 1 + (effKeywords(state, enemy).movement ?? 0)
  if (chebyshev(enemy, av) <= mv + 1 && effAttack(state, enemy) > 0) return true
  const kw = effKeywords(state, enemy)
  return (!!kw.ranged || !!kw.spellcaster || enemy.isAvatar) && (enemy.x === av.x || enemy.y === av.y)
}

function avatarDanger(state: GameState, me: PlayerId, sq: { x: number; y: number }): number {
  let d = 0
  for (const e of Object.values(state.units)) {
    if (e.controller === me || isDisabled(state, e)) continue
    const mv = 1 + (effKeywords(state, e).movement ?? 0)
    if (chebyshev(e, sq) <= mv + 1) d += Math.max(1, effAttack(state, e))
    const kw = effKeywords(state, e)
    if ((kw.ranged || kw.spellcaster || e.isAvatar) && (Math.abs(e.x - sq.x) <= 1 || Math.abs(e.y - sq.y) <= 1)) d += 2
  }
  return d
}

/** does a ranged unit already have a clean line onto the enemy avatar? */
function lineHitsEnemyAvatar(state: GameState, me: PlayerId, u: UnitState, range: number): boolean {
  return avatarShotDir(state, me, u, range) !== null
}

function avatarShotDir(state: GameState, me: PlayerId, u: UnitState, range: number): 'n' | 's' | 'e' | 'w' | null {
  const enemyAvatar = avatarOf(state, enemyOf(me))
  for (const dir of ['n', 's', 'e', 'w'] as const) {
    const dx = dir === 'e' ? 1 : dir === 'w' ? -1 : 0
    const dy = dir === 'n' ? 1 : dir === 's' ? -1 : 0
    for (let step = 1; step <= range; step++) {
      const x = u.x + dx * step
      const y = u.y + dy * step
      if (x < 0 || x > 4 || y < 0 || y > 3) break
      const here = unitsAt(state, x, y, u.region).filter((t) => !t.stealth)
      if (here.length) {
        // first unit in the line must be the enemy avatar
        if (here.some((t) => t.isAvatar && t.controller !== me)) return dir
        break
      }
    }
  }
  return null
}

function bestProjectileDir(state: GameState, me: PlayerId, caster: UnitState): 'n' | 's' | 'e' | 'w' | null {
  let bestDir: 'n' | 's' | 'e' | 'w' | null = null
  let bestScore = 0
  for (const dir of ['n', 's', 'e', 'w'] as const) {
    const dx = dir === 'e' ? 1 : dir === 'w' ? -1 : 0
    const dy = dir === 'n' ? 1 : dir === 's' ? -1 : 0
    let x = caster.x
    let y = caster.y
    for (;;) {
      x += dx; y += dy
      if (x < 0 || x > 4 || y < 0 || y > 3) break
      const here = unitsAt(state, x, y, caster.region).filter((u) => !u.stealth)
      if (here.length) {
        const impact = here.find((u) => u.controller !== me) ?? here[0]
        if (impact.controller !== me) {
          const s = scoreDamageTarget(state, me, impact, 3)
          if (s > bestScore) { bestScore = s; bestDir = dir }
        }
        break
      }
    }
  }
  return bestDir
}

function projectileHitsEnemyAvatar(state: GameState, me: PlayerId, caster: UnitState, dir: 'n' | 's' | 'e' | 'w'): boolean {
  const dx = dir === 'e' ? 1 : dir === 'w' ? -1 : 0
  const dy = dir === 'n' ? 1 : dir === 's' ? -1 : 0
  let x = caster.x
  let y = caster.y
  for (;;) {
    x += dx; y += dy
    if (x < 0 || x > 4 || y < 0 || y > 3) break
    const here = unitsAt(state, x, y, caster.region).filter((u) => !u.stealth)
    if (here.length) return here.some((u) => u.isAvatar && u.controller !== me)
  }
  return false
}

// ---------- resource / ramp helpers ----------

function wantMoreSites(state: GameState, me: PlayerId, inHand: { def: any }[], haveCastablePlay: boolean): boolean {
  const mySites = Object.values(state.sites).filter((s) => s.controller === me && !s.isRubble).length
  if (mySites < 3) return true
  if (haveCastablePlay) return false
  return inHand.some(({ def }) => nearlyCastable(state, me, def))
}

function nearlyCastable(state: GameState, me: PlayerId, def: any): boolean {
  if (def.type === 'Site' || def.type === 'Avatar') return false
  const p = state.players[me]
  const manaShort = (def.cost ?? 0) - p.mana
  if (manaShort > 1) return false
  const aff = affinity(state, me)
  let lack = 0
  for (const el of REGIONS) {
    lack += Math.max(0, (def.thresholds?.[el] ?? 0) - (aff[el] ?? 0))
  }
  return lack <= 1 && manaShort <= 1 && manaShort + lack >= 1
}

// ---------- damage targeting ----------

function ourUndefendedSites(state: GameState, me: PlayerId) {
  return Object.values(state.sites).filter(
    (s) => s.controller === me && !s.isRubble &&
      !Object.values(state.units).some((u) => u.controller === me && u.x === s.x && u.y === s.y),
  )
}

function onEnemySite(state: GameState, me: PlayerId, u: UnitState): boolean {
  return Object.values(state.sites).some(
    (s) => s.controller !== null && s.controller !== me && !s.isRubble && s.x === u.x && s.y === u.y,
  )
}

function threatensOurSites(state: GameState, me: PlayerId, enemy: UnitState): boolean {
  if (effAttack(state, enemy) <= 0) return false
  const mv = 1 + (effKeywords(state, enemy).movement ?? 0)
  return ourUndefendedSites(state, me).some((s) => chebyshev(enemy, s) <= mv)
}

function scoreDamageTarget(state: GameState, me: PlayerId, target: UnitState, damage: number): number {
  if (target.controller === me) return 0
  const pow = Math.max(1, effAttack(state, target))
  if (target.isAvatar) {
    if (target.deathsDoor && damage >= 1) return 1_000_000
    return 5_000 + pow
  }
  const kills = damage >= effDefence(state, target) - target.damage
  if (kills && (onEnemySite(state, me, target) || threatensOurSites(state, me, target))) return 10_000 + pow
  if (kills) return 1_000 + pow
  // non-killing minion damage is POINTLESS (it heals at end of turn) unless a
  // follow-up gang-kill finishes this minion this same turn — only then is the
  // accumulated chip real. A ranged/spell hit that fails this test is worthless.
  if (damage > 0 && minionKillableThisTurn(state, me, target)) return 100 + pow
  return 0
}

function incomingThreat(state: GameState, me: PlayerId): number {
  const myAv = avatarOf(state, me)
  let total = 0
  for (const u of Object.values(state.units)) {
    if (u.controller === me || u.isAvatar || isDisabled(state, u)) continue
    const mv = 1 + (effKeywords(state, u).movement ?? 0)
    if (chebyshev(u, myAv) <= mv + 1 && effAttack(state, u) > 0) total += effAttack(state, u)
  }
  return total
}

// ---------- attack economics (gang-kill coordination + defender modeling) ----------

/** value of a minion for the killed/lost economy: its printed cost, or its power
 *  when cost is unknown (tokens). Never below 1 so a kill is always worth taking. */
function minionValue(state: GameState, u: UnitState): number {
  const cost = getCardMaybe(u.name)?.cost
  if (cost != null && cost > 0) return cost
  return Math.max(1, effAttack(state, u))
}

/** can THIS unit legally reach (or already sit on) the target's square this turn?
 *  Respects airborne (a grounded surface unit can't reach an airborne target). */
function unitCanReach(state: GameState, u: UnitState, target: UnitState): boolean {
  const kw = effKeywords(state, u)
  const tkw = effKeywords(state, target)
  if (tkw.airborne && !kw.airborne && target.region === 'surface') return false
  if (u.x === target.x && u.y === target.y && u.region === target.region) return true
  return reachableLocations(state, u).some(
    (loc) => loc.x === target.x && loc.y === target.y && loc.region === target.region,
  )
}

/**
 * Could the enemy minion `m` be KILLED this turn — either outright by a single
 * reaching attacker (incl. keyword-Lethal), or as a coordinated gang-kill where
 * the combined power of ALL my ready units that can reach it meets its remaining
 * defence? This is what makes a "chip" attack worthwhile: a non-lethal blow is
 * only useful if a follow-up this same turn finishes the minion (damage does NOT
 * heal until the end of turn, so partial damage accumulated this turn is real).
 */
function minionKillableThisTurn(state: GameState, me: PlayerId, m: UnitState): boolean {
  const need = effDefence(state, m) - m.damage
  if (need <= 0) return true
  let gang = 0
  for (const u of Object.values(state.units)) {
    if (u.controller !== me || isDisabled(state, u) || !canTap(state, u)) continue
    if (u.id === m.id) continue
    const pow = effAttack(state, u)
    if (pow <= 0 && !effKeywords(state, u).lethal) continue
    if (!unitCanReach(state, u, m)) continue
    if (effKeywords(state, u).lethal) return true // one lethal reacher kills it
    gang += pow
  }
  return gang >= need
}

/**
 * Expected retaliation an attacker would suffer at `loc` from the opponent's
 * likely defence. Mirrors the `defend`/`intercept` prompt handlers: a melee
 * attack lets the defending player declare co-located / adjacent ready enemy
 * units as defenders (they strike back), and the target itself strikes back.
 * Returns the summed enemy strike power that would land on our attacker.
 */
function expectedRetaliation(
  state: GameState,
  me: PlayerId,
  loc: { x: number; y: number; region?: string },
  target: UnitState | null,
): number {
  // the target itself always strikes back when attacked.
  let total = target ? Math.max(0, effAttack(state, target)) : 0
  for (const e of Object.values(state.units)) {
    if (e.controller === me || isDisabled(state, e)) continue
    if (target && e.id === target.id) continue
    if (e.isAvatar) continue // avatars rarely thrown in as defenders by the engine bot
    // sum all nearby enemy power that could defend — conservative estimate of
    // retaliation; being slightly over-cautious is preferable to walking into ambushes.
    const mv = 1 + (effKeywords(state, e).movement ?? 0)
    if (chebyshev(e, loc) <= mv) total += Math.max(0, effAttack(state, e))
  }
  return total
}
