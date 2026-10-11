import { registerScript } from '../registry'
import { effKeywords } from '../../../engine/statics'
import { pushLog, killUnit } from '../../../engine/effects'

// 'Whenever a non-Airborne minion enters this site, kill it.'
registerScript('Bottomless Pit', {
  onUnitEntersSquare: (ctx, moved) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || moved.isAvatar) return
    if (moved.x !== self.x || moved.y !== self.y || moved.region !== 'surface') return
    if (effKeywords(ctx.state, moved).airborne) return
    pushLog(ctx.state, ctx.controller, `${moved.name} tumbles into the Bottomless Pit!`)
    killUnit(ctx.state, moved.id)
  },
})
