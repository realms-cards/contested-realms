import { registerScript, getScript } from '../registry'
import { pushLog, opponent } from '../../../engine/effects'

// 'Genesis → An opponent chooses a site. When Sir Perceval enters that site,
//  draw a card, then reactivate his Genesis ability.'
registerScript('Sir Perceval', {
  genesis: (ctx) => {
    const spots = Object.values(ctx.state.sites).filter((s) => !s.isRubble).map((s) => ({ x: s.x, y: s.y }))
    if (!spots.length) return
    ctx.ask(
      { kind: 'chooseSquare', title: "Choose the goal of Perceval's quest.", data: { squares: spots }, player: opponent(ctx.controller) },
      'quest',
    )
  },
  onUnitEntersSquare: (ctx, moved) => {
    if (moved.id !== ctx.sourceId) return
    const self = ctx.state.units[ctx.sourceId]
    if (!self || self.counters?.questX === undefined) return
    if (self.x === self.counters.questX && self.y === self.counters.questY) {
      delete self.counters.questX
      delete self.counters.questY
      ctx.drawCard(ctx.controller)
      pushLog(ctx.state, ctx.controller, 'Perceval completes his quest — and dreams of the next!')
      getScript('Sir Perceval')?.genesis?.(ctx)
    }
  },
  conts: {
    quest: (ctx, _c, sq) => {
      const self = ctx.state.units[ctx.sourceId]
      if (self && sq) self.counters = { ...self.counters, questX: sq.x, questY: sq.y }
    },
  },
})
