import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'
import { siteRarity } from '../../../engine/statics'

// 'May be cast to any Elite or Unique site. / Dies if it leaves its summoning site.'
registerScript('Castle Haunt', {
  summonAnywhere: true,
  summonFilter: (state, player, at) => {
    const site = siteAt(state, at.x, at.y)
    if (!site) return 'There is no site there.'
    if (site.controller === player) return null
    const rarity = siteRarity(state, site) // rubble is Ordinary → not a legal haunt
    return rarity === 'Elite' || rarity === 'Unique' ? null : 'Castle Haunt haunts only Elite or Unique sites (or your own).'
  },
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (self) self.counters = { ...self.counters, homeX: self.x, homeY: self.y }
  },
  onUnitEntersSquare: (ctx, moved) => {
    if (moved.id !== ctx.sourceId) return
    const self = ctx.state.units[ctx.sourceId]
    if (!self || self.counters?.homeX === undefined) return
    if (self.x !== self.counters.homeX || self.y !== self.counters.homeY) {
      pushLog(ctx.state, ctx.controller, 'Torn from its haunt, the Castle Haunt dissipates.')
      ctx.kill(self.id)
    }
  },
})
