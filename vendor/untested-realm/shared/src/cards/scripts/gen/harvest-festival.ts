import { registerScript } from '../registry'
import { payZoneToll } from '../../../engine/statics'
import { fromCollection } from '../multi-card-utils/from-collection'

// 'Summon Eltham and Serava Townsfolk from your collection to an allied site.'
registerScript('Harvest Festival', {
  targets: [{ what: 'site', count: 1, targeted: false, owner: 'ally', label: 'an allied site' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('site' in t)) return
    const site = ctx.state.sites[t.site]
    if (!site || site.controller !== ctx.controller) return
    // one collection access for the whole spell → the Bureau of Occult Control tolls (2) once
    if (!payZoneToll(ctx.state, ctx.controller)) return ctx.log('The Bureau of Occult Control demands (2) for collection access.')
    fromCollection(ctx, 'Eltham Townsfolk', site.x, site.y)
    fromCollection(ctx, 'Serava Townsfolk', site.x, site.y)
  },
})
