import { registerScript, getScript, type EffectAPI, type TargetRef } from '../registry'
import { getCard, findCard } from '../../db'
import { GRID_W, GRID_H, avatarOf } from '../../../engine/grid'
import { validateSummonAt, validateTarget } from '../../../engine/casting'
import type { GameState, PlayerId, Region, UnitState } from '../../../engine/types'
import { pushLog, checkStateBased, banishUnit, effectSummonUnit, bumpManaSpent } from '../../../engine/effects'
import { zoneAccessToll } from '../../../engine/statics'

// The echoed copy fires its Genesis — and a Genesis that needs a target (Gargantula's
// "drag an adjacent minion") must let the controller pick one, exactly as a hand-cast
// would. We validate candidates from WHERE THE COPY LANDS (a pseudo-caster at `at`,
// mirroring castSpell's genesis-target anchor), prompt, then flicker with that target.
function deathspeakerFlickerWithGenesis(ctx: EffectAPI, name: string, at: { x: number; y: number }, region: Region): void {
  const specs = getScript(name)?.genesisTargets ?? []
  // current genesis-target minions all declare a single spec; a hypothetical multi-target
  // one falls back to firing with no chosen target rather than a half-collected list.
  const spec = specs.length === 1 ? specs[0] : null
  if (!spec) return deathspeakerFlicker(ctx, name, at, region, [])
  const anchorBase = ctx.state.units[ctx.sourceId] ?? avatarOf(ctx.state, ctx.controller)
  const anchor = { ...anchorBase, x: at.x, y: at.y, region } as UnitState
  const cands: string[] = []
  for (const u of Object.values(ctx.state.units)) {
    if (validateTarget(ctx.state, spec, { unit: u.id }, anchor, ctx.controller) === null) cands.push(u.id)
  }
  if (!cands.length) return deathspeakerFlicker(ctx, name, at, region, [])
  ctx.ask(
    { kind: 'chooseTargets', title: `${name}'s echo — ${spec.label ?? 'choose a target'}`, data: { candidates: cands, count: 1, upTo: !!spec.upTo, kind: 'unit' } },
    'speakGenesis',
    { name, ax: at.x, ay: at.y, region },
  )
}

registerScript('Deathspeaker', {
  abilities: [{
    key: 'speak',
    label: 'Banish a dead minion → flicker a copy',
    cost: {},
    oncePerTurn: true,
    deferUse: true, // the turn's use is spent only when the echo SUMMONS — so you can back out of the
    // "which minion / where / genesis target" prompts freely until then (nothing is committed early)
    usableFromCemetery: true, // banish/copy a dead minion + summon at a player-chosen square; no activator position → Vivien can do it from the grave
    // Gate the ability on there being a dead minion in EITHER cemetery. canActivate + the GUI
    // re-evaluate available() live (every render), so the button greys when both cemeteries hold
    // no minion and re-lights the instant one dies into either — "checked at every cemetery update".
    available: (state) => state.players.some((pl) => pl.cemetery.some((id) => getCard(state.cards[id].name).type === 'Minion')),
    effect: (ctx) => {
      // "a dead minion" is unqualified — a minion in EITHER cemetery counts (like Corpse Catapult)
      const names = new Set<string>()
      for (const pl of ctx.state.players) {
        for (const id of pl.cemetery) {
          if (getCard(ctx.state.cards[id].name).type === 'Minion') names.add(ctx.state.cards[id].name)
        }
      }
      const options = [...names]
      if (!options.length) return ctx.log('No dead minion to speak for.')
      ctx.ask({ kind: 'chooseOption', title: 'Speak for which dead minion?', data: { options } }, 'speak')
    },
  }],
  conts: {
    speak: (ctx, _c, choice) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || !choice) return
      const name = String(choice)
      const p = ctx.state.players[ctx.controller]
      // the echo reaches into a cemetery, so the Bureau of Occult Control tolls (2) for that access
      const cost = (self.deathsDoor ? 0 : findCard(name)?.cost ?? 0) + zoneAccessToll(ctx.state)
      if (p.mana < cost) return ctx.log(`Not enough mana (${p.mana}/${cost}).`)
      // offer every square the copy could legally enter (validateSummonAt is the arbiter),
      // then let the player pick where its echo appears so its Genesis fires there.
      const region: Region = getScript(name)?.mustSummonRegion ?? 'surface'
      const squares: { x: number; y: number }[] = []
      for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
        if (validateSummonAt(ctx.state, ctx.controller, name, { x, y, region }) === null) squares.push({ x, y })
      }
      if (!squares.length) return ctx.log(`There is nowhere to summon ${name}.`)
      if (squares.length === 1) return deathspeakerFlickerWithGenesis(ctx, name, squares[0], region)
      ctx.ask({ kind: 'chooseSquare', title: `Where does ${name}'s echo appear?`, data: { squares } }, 'speakAt', { name, region })
    },
    speakAt: (ctx, c, sq) => {
      if (!sq || typeof sq.x !== 'number') return
      deathspeakerFlickerWithGenesis(ctx, String(c.name), { x: sq.x, y: sq.y }, (c.region as Region) ?? 'surface')
    },
    speakGenesis: (ctx, c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const targets: TargetRef[] = typeof id === 'string' ? [{ unit: id }] : []
      deathspeakerFlicker(ctx, String(c.name), { x: c.ax as number, y: c.ay as number }, (c.region as Region) ?? 'surface', targets)
    },
  },
})

/** create a token-copy of any minion card (copy effects) and bring it into the
 *  realm through the shared effect-entry path so its Genesis fires (FAQ 745/752). */
function copyMinion(state: GameState, name: string, controller: PlayerId, x: number, y: number, region: Region, tapped = false, genesisTargets: TargetRef[] = []): UnitState | null {
  const cardId = `c${state.nextId++}`
  state.cards[cardId] = { id: cardId, name, owner: controller, isToken: true }
  const unitId = `u${state.nextId++}`
  const unit: UnitState = {
    id: unitId, cardId, name, owner: controller, controller, isAvatar: false, x, y, region,
    tapped, damage: 0, enteredTurn: state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
  }
  return effectSummonUnit(state, unit, genesisTargets)
}

// Deathspeaker avatar: banish a dead minion each turn to cast a copy of it (0 at death's door). The
// copy enters at a player-chosen location so its Genesis fires there, then is banished.
function deathspeakerFlicker(ctx: EffectAPI, name: string, at: { x: number; y: number }, region: Region, genesisTargets: TargetRef[] = []): void {
  const self = ctx.state.units[ctx.sourceId]
  const p = ctx.state.players[ctx.controller]
  // Bureau of Occult Control tolls (2) for reaching into a cemetery (mirrors the pre-check in `speak`)
  const cost = (self?.deathsDoor ? 0 : findCard(name)?.cost ?? 0) + zoneAccessToll(ctx.state)
  if (p.mana < cost) return ctx.log(`Not enough mana (${p.mana}/${cost}).`)
  // the dead minion may lie in EITHER cemetery ("a dead minion")
  let owner: 0 | 1 | null = null
  let idx = -1
  for (const pid of [0, 1] as (0 | 1)[]) {
    const i = ctx.state.players[pid].cemetery.findIndex((id) => ctx.state.cards[id].name === name)
    if (i >= 0) { owner = pid; idx = i; break }
  }
  if (owner === null) return
  // COMMIT: now the echo actually happens, so spend the once-per-turn use (deferUse — see the ability).
  if (self) self.usedThisTurn.speak = 1
  p.mana -= cost
  if (cost > 0) bumpManaSpent(ctx.state, ctx.controller, cost) // count against spent so the total-mana widget doesn't shrink
  const [id] = ctx.state.players[owner].cemetery.splice(idx, 1)
  ctx.state.players[ctx.state.cards[id].owner].banished.push(id) // banished to its owner's pile
  const copy = copyMinion(ctx.state, name, ctx.controller, at.x, at.y, region, false, genesisTargets)
  if (copy && ctx.state.units[copy.id]) banishUnit(ctx.state, copy.id)
  pushLog(ctx.state, ctx.controller, `${name}'s echo fades back into death.`)
  checkStateBased(ctx.state)
}
