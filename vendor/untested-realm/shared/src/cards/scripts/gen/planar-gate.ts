import { registerScript } from '../registry'

// 'Minions here can traverse the void, gaining Voidwalk until leaving it.'
registerScript('Planar Gate', {
  siteGrantsKeywords: (state, site, unit) => {
    // "Minions here" spans the site's surface AND subsurface (not the void square, which the counter
    // branch below handles once a minion has walked out into it).
    if (unit.x === site.x && unit.y === site.y && unit.region !== 'void') return ['voidwalk']
    return unit.region === 'void' && unit.counters?.planarGate ? ['voidwalk'] : []
  },
  onUnitEntersSquare: (ctx, moved, from) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    if (moved.region === 'void' && from.x === self.x && from.y === self.y) {
      moved.counters = { ...moved.counters, planarGate: 1 }
    } else if (moved.region !== 'void' && moved.counters?.planarGate) {
      delete moved.counters.planarGate
    }
  },
})
