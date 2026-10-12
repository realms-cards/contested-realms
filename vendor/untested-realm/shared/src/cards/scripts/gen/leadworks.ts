import { registerScript } from '../registry'
import { pushLog, notifySiteInterference } from '../../../engine/effects'
import { nearbySquaresW, siteAt } from '../../../engine/grid'

// 'Genesis → Until your next turn, sites are silenced while nearby.'
registerScript('Leadworks', {
  genesis: (ctx) => {
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.siteSilences = ctx.state.flow.siteSilences ?? []
    ctx.state.flow.siteSilences.push({ siteId: ctx.sourceId, player: ctx.controller, turn: ctx.state.turn })
    pushLog(ctx.state, ctx.controller, 'The Leadworks dampen all magic nearby — sites fall silent.')
    // the silenced neighbors count as modified (Vindictive Nation)
    const self = ctx.state.sites[ctx.sourceId]
    if (self) {
      for (const q of nearbySquaresW(ctx.state, self.x, self.y)) {
        const s = siteAt(ctx.state, q.x, q.y)
        if (s && s.id !== self.id && !s.isRubble) notifySiteInterference(ctx.state, 'modify', s, ctx.controller)
      }
    }
  },
})
