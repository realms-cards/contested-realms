import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'

// 'Give an allied minion Stealth. If it occupies an enemy site, draw a card.'
registerScript('Fade', {
  targets: [{ what: 'minion', count: 1, targeted: false, owner: 'ally', label: 'an allied minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    u.stealth = true
    const site = siteAt(ctx.state, u.x, u.y)
    if (site && site.controller !== null && site.controller !== ctx.controller) ctx.drawCard(ctx.controller)
  },
})
