import { registerScript, getScript } from '../registry'
import { pushLog, opponent } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'
import type { GameState } from '../../../engine/types'

// 'Genesis → An opponent chooses a site. When Sir Perceval enters that site,
//  draw a card, then reactivate his Genesis ability.'
// The quest is kept as the chosen SITE's id (flow.percevalQuest: Perceval's unit id → site id), so it
// follows the site if it's moved (Earthquake…). The client reads it to plant a 🚩 on that site.

/** the site Perceval `unitId` is questing for, if any (still in the realm) */
export function percevalQuestSite(state: GameState, unitId: string) {
  const siteId = state.flow?.percevalQuest?.[unitId]
  return siteId ? state.sites[siteId] : undefined
}

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
    const goal = percevalQuestSite(ctx.state, ctx.sourceId)
    if (!self || !goal || self.x !== goal.x || self.y !== goal.y) return
    delete ctx.state.flow!.percevalQuest![ctx.sourceId]
    ctx.drawCard(ctx.controller)
    pushLog(ctx.state, ctx.controller, 'Perceval completes his quest — and dreams of the next!')
    getScript('Sir Perceval')?.genesis?.(ctx)
  },
  conts: {
    quest: (ctx, _c, sq) => {
      const site = sq ? siteAt(ctx.state, sq.x, sq.y) : undefined
      if (!ctx.state.units[ctx.sourceId] || !site) return
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.percevalQuest = { ...(ctx.state.flow.percevalQuest ?? {}), [ctx.sourceId]: site.id }
      pushLog(ctx.state, ctx.controller, `Perceval's quest: reach ${site.name}.`)
    },
  },
})
