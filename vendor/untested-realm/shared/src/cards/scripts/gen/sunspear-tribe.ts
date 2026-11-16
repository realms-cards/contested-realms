import { registerScript } from '../registry'
import { fireVolleyProjectiles } from '../../../engine/combat'

// 'Once per game → Throw a projectile that deals 1 damage.'
// An activated ability with no cost, usable once by this minion (the game object: a Tribe that leaves and
// comes back is a new object with a fresh spear). "Throw" a projectile = shoot one (codex synonyms): it
// flies in a chosen cardinal direction from the Tribe's location, in its region, until it hits a unit.
// The use is claimed on activation, so backing out of the direction prompt can't refund it.
registerScript('Sunspear Tribe', {
  abilities: [{
    key: 'spear',
    label: 'Once per game → Throw a spear (1 damage)',
    cost: {},
    available: (state, id) => !state.units[id]?.counters?.spearThrown,
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || self.counters?.spearThrown) return
      self.counters = { ...self.counters, spearThrown: 1 }
      ctx.ask({ kind: 'chooseOption', title: 'Throw the spear in which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'throw')
    },
  }],
  conts: {
    throw: (ctx, _c, dir) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || typeof dir !== 'string') return
      fireVolleyProjectiles(ctx.state, {
        player: ctx.controller, ox: self.x, oy: self.y, region: self.region,
        dir, volleys: 1, damage: 1, excludeId: self.id, shooterId: self.id, srcName: 'Sunspear Tribe',
      })
    },
  },
})
