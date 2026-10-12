import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'

// 'Spellcaster / Genesis â†’ You may sacrifice another minion here to draw a spell.'
registerScript('Cauldron Crones', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const candidates = unitsAt(ctx.state, self.x, self.y, self.region)
      .filter((u) => u.id !== self.id && !u.isAvatar && u.controller === ctx.controller)
      .map((u) => u.id)
    if (!candidates.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'Sacrifice a minion here to draw a spell?', data: { candidates, count: 1, upTo: true, kind: 'unit' } }, 'stew')
  },
  conts: {
    stew: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (!id || !ctx.state.units[id]) return
      ctx.kill(id)
      ctx.draw(ctx.controller, 'spellbook')
    },
  },
})
