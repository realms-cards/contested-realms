import { registerScript } from '../registry'
import { orthAdjacentWrapped, unitsAt } from '../../../engine/grid'
import { isLegalStep } from '../../../engine/movement'
import { beginAttack } from '../../../engine/combat'

// 'After her first attack each turn, Bladedancer may take a step. When she does,
//  she may attack a unit there.'
registerScript('Bladedancer', {
  afterAttack: (ctx, attacker) => {
    const flow = (ctx.state.flow = ctx.state.flow ?? {})
    if (flow.bladeStep?.[ctx.controller] === ctx.state.turn) return
    flow.bladeStep = { ...(flow.bladeStep ?? {}), [ctx.controller]: ctx.state.turn }
    const from = { x: attacker.x, y: attacker.y, region: attacker.region }
    const squares = orthAdjacentWrapped(ctx.state, attacker.x, attacker.y).filter(
      (s) => isLegalStep(ctx.state, attacker, from, { ...s, region: attacker.region }),
    )
    if (!squares.length) return
    ctx.ask({ kind: 'chooseSquare', title: 'Bladedancer dances onward — step where? (Esc to stay)', data: { squares } }, 'step')
  },
  conts: {
    step: (ctx, _c, sq) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || !sq) return
      if (!orthAdjacentWrapped(ctx.state, self.x, self.y).some((s) => s.x === sq.x && s.y === sq.y)) return
      ctx.teleport(self.id, sq.x, sq.y, self.region)
      const prey = unitsAt(ctx.state, sq.x, sq.y, self.region).filter((u) => u.controller !== ctx.controller && !u.stealth)
      if (!prey.length) return
      ctx.ask(
        { kind: 'chooseTargets', title: 'Whirling blades — attack which unit here?', data: { candidates: prey.map((u) => u.id), count: 1, upTo: true, kind: 'unit' } },
        'slash',
      )
    },
    slash: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const self = ctx.state.units[ctx.sourceId]
      if (!self || typeof id !== 'string' || !ctx.state.units[id]) return
      beginAttack(ctx.state, self, { unit: id })
    },
  },
})
