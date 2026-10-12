import { registerScript } from '../registry'
import { getCard } from '../../db'
import { adjacentSquaresW, isWaterSite, siteAt } from '../../../engine/grid'

// "Deal 1 damage to target minion above or below an adjacent Water site and pull
// it to the caster's location. Draw a card."
registerScript('Fire Harpoons!', {
  targets: [{
    what: 'minion', count: 1, targeted: false, label: 'a minion at an adjacent water site',
    filter: (state, u, caster) => {
      const site = siteAt(state, u.x, u.y)
      if (!site || !isWaterSite(state, site, getCard)) return false
      return adjacentSquaresW(state, caster.x, caster.y).some((s) => s.x === u.x && s.y === u.y)
    },
  }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('unit' in t)) return
    const caster = ctx.caster!
    const u = ctx.state.units[t.unit]
    if (!u) return
    ctx.dealDamage({ unit: u.id }, 1)
    ctx.settleDeaths() // single target: resolve its death now so a killed minion isn't pulled as a corpse
    if (ctx.state.units[u.id]) ctx.teleport(u.id, caster.x, caster.y, caster.region, { push: true }) // forced pull
    ctx.drawCard(ctx.controller)
  },
})
