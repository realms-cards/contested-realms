import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { awardAchievement } from '../../../engine/achievements.catalog'

// 'Genesis → Other Courts are disabled until your next turn.'
registerScript('Overflowing Court', {
  genesis: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.courtDisables = [
      ...(ctx.state.flow.courtDisables ?? []),
      { player: ctx.controller, turn: ctx.state.turn, sourceId: self.id },
    ]
    pushLog(ctx.state, ctx.controller, 'The Overflowing Court drowns out the rest — other Courts are disabled until your next turn.')
    // That's a court too — a Court MINION (Seelie/Unseelie Court, Court Jester) was in play → disabled
    if (Object.values(ctx.state.units).some((u) => u.name === 'Seelie Court' || u.name === 'Unseelie Court' || u.name === 'Court Jester'))
      awardAchievement(ctx.state, 'court-too', ctx.controller)
  },
})
