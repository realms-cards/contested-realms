import { registerScript } from '../registry'
import { pushLog, killUnit, checkStateBased } from '../../../engine/effects'
import { orthAdjacentWrapped, unitsAt } from '../../../engine/grid'
import { isLegalStep } from '../../../engine/movement'

// 'Tap → Tringh Constrictor may take a step, then it constricts target minion
//  here and carries it disabled. The next time it would untap, it instead kills
//  that minion if it's still constricted.'
registerScript('Tringh Constrictor', {
  carriedAreDisabled: true,
  abilities: [{
    key: 'constrict',
    label: 'Slither & constrict a minion',
    cost: { tap: true },
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const from = { x: self.x, y: self.y, region: self.region }
      const squares = orthAdjacentWrapped(ctx.state, self.x, self.y).filter((s) => isLegalStep(ctx.state, self, from, { ...s, region: self.region }))
      ctx.ask({ kind: 'chooseSquare', title: 'The Constrictor slithers where? (its square to stay)', data: { squares: [...squares, { x: self.x, y: self.y }] } }, 'slither')
    },
  }],
  startOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || !self.tapped || !self.counters?.constricting) return
    const preyId = `u${self.counters.constricting}`
    const prey = ctx.state.units[preyId]
    if (prey && prey.carriedBy === self.id) {
      pushLog(ctx.state, ctx.controller, `The Constrictor squeezes the life from ${prey.name}.`)
      killUnit(ctx.state, prey.id)
      checkStateBased(ctx.state)
    }
    delete self.counters.constricting
    self.tapped = true
    self.counters = { ...self.counters, skipUntap: 0 } // consume next-turn kill cycle
  },
  conts: {
    slither: (ctx, _c, sq) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      if (sq && (sq.x !== self.x || sq.y !== self.y) && orthAdjacentWrapped(ctx.state, self.x, self.y).some((s) => s.x === sq.x && s.y === sq.y)) {
        ctx.teleport(self.id, sq.x, sq.y, self.region)
      }
      const prey = unitsAt(ctx.state, self.x, self.y, self.region).filter((u) => u.id !== self.id && !u.isAvatar).map((u) => u.id)
      if (!prey.length) return
      ctx.ask({ kind: 'chooseTargets', title: 'Constrict which minion here?', data: { candidates: prey, count: 1, upTo: true, kind: 'unit' } }, 'squeeze')
    },
    squeeze: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const self = ctx.state.units[ctx.sourceId]
      const prey = typeof id === 'string' ? ctx.state.units[id] : null
      if (!self || !prey) return
      prey.carriedBy = self.id
      self.carryingUnits = [...(self.carryingUnits ?? []), prey.id]
      self.counters = { ...self.counters, constricting: Number(prey.id.slice(1)), skipUntap: 1 }
      pushLog(ctx.state, ctx.controller, `The Constrictor coils around ${prey.name}.`)
    },
  },
})
