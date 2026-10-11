import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { inBounds, siteAt, unitsAt } from '../../../engine/grid'
import { projectileCanHit, regionPresentAt } from '../../../engine/statics'

// 'Bearer strikes first and has "Tap → Throw Rhongomyniad as a piercing
//  projectile. Deal 3 damage to each hit unit."'
registerScript('Rhongomyniad', {
  bearerKeywords: ['strike first'],
  abilities: [{
    key: 'hurl',
    label: 'Throw Rhongomyniad (piercing, 3 dmg each)',
    cost: {},
    effect: (ctx) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      const bearer = art?.carriedBy ? ctx.state.units[art.carriedBy] : null
      if (!bearer || bearer.tapped) return ctx.log('The bearer must be ready to throw.')
      ctx.ask({ kind: 'chooseOption', title: 'Hurl the holy lance which way?', data: { options: ['n', 's', 'e', 'w'] } }, 'pierce')
    },
  }],
  conts: {
    pierce: (ctx, _c, dir) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      const bearer = art?.carriedBy ? ctx.state.units[art.carriedBy] : null
      if (!art || !bearer || typeof dir !== 'string' || bearer.tapped) return
      bearer.tapped = true
      const dx = dir === 'e' ? 1 : dir === 'w' ? -1 : 0
      const dy = dir === 'n' ? 1 : dir === 's' ? -1 : 0
      let { x, y } = bearer
      let lastSite = { x: bearer.x, y: bearer.y }
      for (;;) {
        x += dx
        y += dy
        if (!inBounds(x, y)) break
        if (!regionPresentAt(ctx.state, bearer.region, x, y)) break // the lance stops at the void
        for (const u of unitsAt(ctx.state, x, y, bearer.region)) {
          if (projectileCanHit(ctx.state, u)) ctx.dealDamage({ unit: u.id }, 3)
        }
        if (siteAt(ctx.state, x, y)) lastSite = { x, y }
      }
      // the lance lands where it stops flying
      bearer.carrying = bearer.carrying.filter((id) => id !== art.id)
      art.carriedBy = null
      art.x = lastSite.x
      art.y = lastSite.y
      pushLog(ctx.state, ctx.controller, 'Rhongomyniad pierces the field and stands quivering in the earth.')
    },
  },
})
