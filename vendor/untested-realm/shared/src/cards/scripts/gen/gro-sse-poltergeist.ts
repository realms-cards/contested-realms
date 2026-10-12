import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { nearbySquaresW } from '../../../engine/grid'
import type { PlayerId, UnitState } from '../../../engine/types'

/** animate an artifact into an Automaton unit; returns the new unit */
function animate(ctx: EffectAPI, artId: string, controller: PlayerId, extraCounters: Record<string, number> = {}): UnitState | null {
  const art = ctx.state.artifacts[artId]
  if (!art) return null
  if (art.carriedBy) {
    const carrier = ctx.state.units[art.carriedBy]
    if (carrier) carrier.carrying = carrier.carrying.filter((id) => id !== art.id)
  }
  const power = getCard(art.name).cost ?? 0
  const unitId = `u${ctx.state.nextId++}`
  const u: UnitState = {
    id: unitId, cardId: art.cardId, name: art.name, owner: ctx.state.cards[art.cardId]?.owner ?? controller,
    controller, isAvatar: false, x: art.x, y: art.y, region: art.region === 'void' ? 'surface' : art.region,
    tapped: art.tapped, damage: 0, enteredTurn: ctx.state.turn,
    modifiers: [{ kind: 'power', amount: power, duration: 'permanent', turn: ctx.state.turn, sourcePlayer: controller }],
    carrying: [], carryingUnits: [], usedThisTurn: {}, counters: { animatedArtifact: 1, ...extraCounters },
  }
  delete ctx.state.artifacts[artId]
  ctx.state.units[unitId] = u
  return u
}

/** turn an animated unit back into the artifact it was */
function deanimate(ctx: EffectAPI, unitId: string, conjuredBy: PlayerId): void {
  const u = ctx.state.units[unitId]
  if (!u || !u.counters?.animatedArtifact) return
  const artId = `a${ctx.state.nextId++}`
  ctx.state.artifacts[artId] = {
    id: artId, cardId: u.cardId, name: u.name, conjuredBy,
    x: u.x, y: u.y, region: u.region === 'void' ? 'surface' : u.region, carriedBy: null, tapped: u.tapped,
  }
  delete ctx.state.units[unitId]
}

// 'Tap → Until Grösse Poltergeist leaves the realm, gain control of a nearby
//  artifact and animate it. It's an Automaton with power equal to its cost, and
//  has its own bearer abilities.' (name stays → its ability scripts keep working)
registerScript('Grösse Poltergeist', {
  selfSubtypes: (_state, self, printed) => printed, // (its own types unchanged)
  subtypeOverride: (_state, _selfId, unit, st) =>
    unit.counters?.animatedArtifact && !st.includes('Automaton') ? [...st, 'Automaton'] : st,
  abilities: [{
    key: 'haunt',
    label: 'Animate a nearby artifact',
    cost: { tap: true },
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const targets = Object.values(ctx.state.artifacts)
        .filter((a) => nearbySquaresW(ctx.state, self.x, self.y).some((s) => s.x === a.x && s.y === a.y))
        .map((a) => a.name)
      if (!targets.length) return ctx.log('Nothing nearby to haunt.')
      ctx.ask({ kind: 'chooseOption', title: 'The Poltergeist slips into which artifact?', data: { options: targets } }, 'haunt')
    },
  }],
  deathrite: (ctx) => {
    // the haunting ends: possessed artifacts drop back to the ground
    for (const u of Object.values(ctx.state.units)) {
      if (u.counters?.hauntedBy === Number(ctx.sourceId.slice(1))) {
        const original = (u.counters.hauntedFrom ?? ctx.controller) as PlayerId
        pushLog(ctx.state, ctx.controller, `${u.name} clatters lifeless to the ground.`)
        deanimate(ctx, u.id, original)
      }
    }
  },
  conts: {
    haunt: (ctx, _c, choice) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || typeof choice !== 'string') return
      const art = Object.values(ctx.state.artifacts).find(
        (a) => a.name === choice && nearbySquaresW(ctx.state, self.x, self.y).some((s) => s.x === a.x && s.y === a.y),
      )
      if (!art) return
      const original = art.carriedBy ? ctx.state.units[art.carriedBy]?.controller ?? art.conjuredBy : art.conjuredBy
      const u = animate(ctx, art.id, ctx.controller, {
        hauntedBy: Number(ctx.sourceId.slice(1)),
        hauntedFrom: original as unknown as number,
      })
      if (u) pushLog(ctx.state, ctx.controller, `${u.name} rattles to life, possessed!`)
    },
  },
})
