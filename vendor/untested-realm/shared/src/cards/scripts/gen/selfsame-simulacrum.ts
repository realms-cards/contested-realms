import { registerScript, getScript } from '../registry'
import { pushLog, makeCtx } from '../../../engine/effects'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'

// 'May be summoned as a basic copy of a nearby minion.'
registerScript('Selfsame Simulacrum', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const models = nearbySquaresW(ctx.state, self.x, self.y)
      // nearby minion is region-locked to the source
      .flatMap((s) => unitsAt(ctx.state, s.x, s.y, self.region))
      .filter((u) => !u.isAvatar && u.id !== self.id)
      .map((u) => u.id)
    if (!models.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'The Simulacrum mirrors which nearby minion? (skip to stay itself)', data: { candidates: models, count: 1, upTo: true, kind: 'unit' } }, 'mirror')
  },
  conts: {
    mirror: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const self = ctx.state.units[ctx.sourceId]
      const model = typeof id === 'string' ? ctx.state.units[id] : null
      if (!self || !model) return
      self.name = model.name
      pushLog(ctx.state, ctx.controller, `The Simulacrum reshapes itself into ${model.name}.`)
      // "May be SUMMONED AS a basic copy" + FAQ: "Does it copy Genesis abilities?
      // A: Yes" — the copy applies as it is summoned, so the copied card's Genesis
      // fires now (empty targets = do as much as you can).
      const copied = getScript(model.name)?.genesis
      if (copied && !self.silenced) copied(makeCtx(ctx.state, self.id, ctx.controller, []))
    },
  },
})
