import { registerScript } from '../registry'
import { getCard } from '../../db'
import { avatarOf } from '../../../engine/grid'
import { castFromCollection, affordable } from '../../../engine/casting'
import { collectionNames } from '../../../engine/statics'

// 'Genesis → You may cast a Townsfolk from your collection to this site.'
registerScript('Troubled Town', {
  genesis: (ctx) => {
    const caster = avatarOf(ctx.state, ctx.controller)
    const names = collectionNames(ctx.state, ctx.controller).filter((n) => {
      const d = getCard(n)
      // only offer Townsfolk the player can actually pay for ("you MAY cast")
      return d.type === 'Minion' && /townsfolk/i.test(n) && affordable(ctx.state, ctx.controller, n, caster)
    })
    if (!names.length) return
    ctx.ask({ kind: 'nameCard', title: 'Which Townsfolk answer the call?', data: { names, fromCollection: true } }, 'muster')
  },
  conts: {
    muster: (ctx, _c, name) => {
      const self = ctx.state.sites[ctx.sourceId]
      if (!self || typeof name !== 'string' || !/townsfolk/i.test(name)) return
      // "cast a Townsfolk … to this site": a REAL cast paying its cost (not a free
      // summon), consuming the copy and tolled/gated like any collection access.
      castFromCollection(ctx.state, ctx.controller, name, { x: self.x, y: self.y, region: 'surface' })
    },
  },
})
