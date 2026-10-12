import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { siteAt, unitsAt } from '../../../engine/grid'

// Knights of the Round Table ------------------------------------------------

// 'Whenever Sir Balin strikes an Avatar, destroy that Avatar's site then burrow
//  other minions and artifacts there.'
registerScript('Sir Balin', {
  onAllyStrikesAvatar: (ctx, striker, avatar) => {
    if (striker.id !== ctx.sourceId) return
    const site = siteAt(ctx.state, avatar.x, avatar.y)
    if (!site) return
    ctx.destroySite(site.id)
    for (const u of unitsAt(ctx.state, avatar.x, avatar.y, 'surface')) {
      if (!u.isAvatar && u.id !== striker.id) u.region = 'underground'
    }
    for (const a of Object.values(ctx.state.artifacts)) {
      if (!a.carriedBy && a.x === avatar.x && a.y === avatar.y && a.region === 'surface') a.region = 'underground'
    }
    pushLog(ctx.state, ctx.controller, "Sir Balin's dolorous stroke shatters the very ground!")
  },
})
