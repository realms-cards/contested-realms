import { registerScript } from '../registry'

// 'Genesis → This turn, the next Evil cast to this site costs (1) less, ignoring threshold.'
// Modelled exactly like Pond (Beast): a one-shot spellDiscount with noThreshold — this covers
// BOTH the (1) discount AND waiving the threshold (a plain costModifier only cut the cost, so
// the threshold was still enforced). The discount is spent by the first matching Evil cast here.
registerScript('Den of Evil', {
  genesis: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.spellDiscounts = [
      ...(ctx.state.flow.spellDiscounts ?? []),
      { player: ctx.controller, turn: ctx.state.turn, amount: 1, noThreshold: true, evil: true, at: { x: self.x, y: self.y } },
    ]
  },
})
