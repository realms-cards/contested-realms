import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'

// 'This turn, flood target site and give each minion there Airborne. Draw a card.'
registerScript('Geyser', {
  targets: [{ what: 'site', count: 1, targeted: true, label: 'target site' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('site' in t)) return
    const site = ctx.state.sites[t.site]
    if (!site) return
    ctx.floodSite(site.id, 'endOfTurn')
    for (const u of unitsAt(ctx.state, site.x, site.y)) {
      if (!u.isAvatar) ctx.grantKeyword(u.id, 'airborne', 'endOfTurn')
    }
    ctx.drawCard(ctx.controller)
  },
})
