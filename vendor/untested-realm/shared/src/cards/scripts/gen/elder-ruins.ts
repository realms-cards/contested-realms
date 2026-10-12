import { registerScript } from '../registry'
import { killUnit, checkStateBased } from '../../../engine/effects'
import { avatarOf, unitsAt } from '../../../engine/grid'
import { collectionBanned } from '../../../engine/statics'
import { castFromCollection, affordable } from '../../../engine/casting'

// 'Sacrifice a minion here → Cast a Shoggoth submerged here from your collection.'
registerScript('Elder Ruins', {
  abilities: [{
    key: 'offering',
    label: 'Sacrifice a minion here → cast a Shoggoth submerged',
    cost: {},
    effect: (ctx) => {
      const self = ctx.state.sites[ctx.sourceId]
      if (!self) return
      // "Cast a Shoggoth submerged here from your collection" PAYS its cost — don't
      // let the player sacrifice a minion when the Shoggoth can't actually be cast
      if ((ctx.state.players[ctx.controller].collection['Shoggoth'] ?? 0) <= 0) return ctx.log('No Shoggoth in your collection.')
      if (collectionBanned(ctx.state, ctx.controller, 'Shoggoth')) return ctx.log('Every Shoggoth was banished by the Legion of Gall.')
      if (!affordable(ctx.state, ctx.controller, 'Shoggoth', avatarOf(ctx.state, ctx.controller))) return ctx.log("You can't afford a Shoggoth.")
      const offerings = unitsAt(ctx.state, self.x, self.y)
        .filter((u) => !u.isAvatar && u.controller === ctx.controller)
        .map((u) => u.id)
      if (!offerings.length) return ctx.log('No minion here to offer.')
      ctx.ask({ kind: 'chooseTargets', title: 'Offer whom to the deep?', data: { candidates: offerings, count: 1, upTo: false, kind: 'unit' } }, 'offer')
    },
  }],
  conts: {
    offer: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const self = ctx.state.sites[ctx.sourceId]
      if (!self || typeof id !== 'string' || !ctx.state.units[id]) return
      killUnit(ctx.state, id)
      checkStateBased(ctx.state)
      // a REAL paid cast, submerged at this site, not a free summon
      castFromCollection(ctx.state, ctx.controller, 'Shoggoth', { x: self.x, y: self.y, region: 'underwater' })
    },
  },
})
