import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'
import { payZoneToll } from '../../../engine/statics'
import { fromCollection } from '../multi-card-utils/from-collection'

// 'Deathrite → You may summon a Horrible Hybrids from your collection to this location.'
registerScript('Estranged Loner', {
  deathrite: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    ctx.ask({ kind: 'yesNo', title: 'The Loner’s true kin answer — summon Horrible Hybrids here?' }, 'kin', { x: self.x, y: self.y })
  },
  conts: {
    kin: (ctx, c, yes) => {
      if (!yes || !siteAt(ctx.state, c.x as number, c.y as number)) return
      // reaching into your collection is tolled by the Bureau of Occult Control
      if (!payZoneToll(ctx.state, ctx.controller)) return ctx.log('The Bureau of Occult Control demands (2) for collection access.')
      fromCollection(ctx, 'Horrible Hybrids', c.x as number, c.y as number)
    },
  },
})
