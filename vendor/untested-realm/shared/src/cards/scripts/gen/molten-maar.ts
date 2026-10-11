import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { avatarOf, siteAt } from '../../../engine/grid'
import { castFromCollection, affordable, affinity } from '../../../engine/casting'

// '(F)(F) — Genesis → You may cast a Hellhounds from your collection to this site.'
registerScript('Molten Maar', {
  genesis: (ctx) => {
    // (F)(F) is a true-affinity gate (Maar's own Fire + bonuses), not just printed Fire on your sites.
    if (affinity(ctx.state, ctx.controller).fire < 2) return
    // "you may CAST a Hellhounds from your collection to this site" — only offer it
    // if owned and payable (the cast pays its cost; see castFromCollection)
    if ((ctx.state.players[ctx.controller].collection['Hellhounds'] ?? 0) <= 0) return
    if (!affordable(ctx.state, ctx.controller, 'Hellhounds', avatarOf(ctx.state, ctx.controller))) return
    ctx.ask({ kind: 'yesNo', title: 'Molten Maar: cast a Hellhounds from your collection here?' }, 'spawn')
  },
  conts: {
    spawn: (ctx, _c, yes) => {
      if (!yes) return
      const maar = ctx.state.sites[ctx.sourceId]
      if (!maar || !siteAt(ctx.state, maar.x, maar.y)) return
      // a REAL paid cast to this site, not a free summon (card text says "cast")
      if (castFromCollection(ctx.state, ctx.controller, 'Hellhounds', { x: maar.x, y: maar.y, region: 'surface' })) {
        pushLog(ctx.state, ctx.controller, 'Hellhounds bound out of the Molten Maar!')
      }
    },
  },
})
