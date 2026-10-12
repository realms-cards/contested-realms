import { registerScript } from '../registry'

// 'Genesis → This turn, the next Beast cast to this site costs (1) less, ignoring threshold.'
registerScript('Pond', {
  genesis: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.spellDiscounts = [
      ...(ctx.state.flow.spellDiscounts ?? []),
      { player: ctx.controller, turn: ctx.state.turn, amount: 1, noThreshold: true, subtype: 'Beast', at: { x: self.x, y: self.y } },
    ]
  },
})
