import { registerScript } from '../registry'
import { pushLog, tapUnit } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'
import { firePiercingProjectile, raySquares } from '../../../engine/combat'
import { canTapForCost } from '../../../engine/statics' // a summoning-sick bearer can't be tapped to pay a cost (codex)

// 'Bearer strikes first and has "Tap → Throw Rhongomyniad as a piercing
//  projectile. Deal 3 damage to each hit unit."'
registerScript('Rhongomyniad', {
  bearerKeywords: ['strikeFirst'],
  abilities: [{
    key: 'hurl',
    label: 'Throw Rhongomyniad (piercing, 3 dmg each)',
    cost: {},
    // the cost taps the bearer: not offered while it can't pay (tapped, disabled, summoning sick)
    available: (state, id) => { const b = state.units[state.artifacts[id]?.carriedBy ?? '']; return !!b && canTapForCost(state, b) },
    effect: (ctx) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      const bearer = art?.carriedBy ? ctx.state.units[art.carriedBy] : null
      if (!bearer || !canTapForCost(ctx.state, bearer)) return ctx.log('The bearer must be ready to throw.')
      ctx.ask({ kind: 'chooseOption', title: 'Hurl the holy lance which way?', data: { options: ['n', 's', 'e', 'w'] } }, 'pierce')
    },
  }],
  conts: {
    pierce: (ctx, _c, dir) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      const bearer = art?.carriedBy ? ctx.state.units[art.carriedBy] : null
      if (!art || !bearer || typeof dir !== 'string' || !canTapForCost(ctx.state, bearer)) return
      tapUnit(ctx.state, bearer)
      // the lance lands where it stops flying (the last site on its path); it leaves the bearer's hand first
      let lastSite = { x: bearer.x, y: bearer.y }
      for (const s of raySquares(ctx.state, bearer.region, bearer.x, bearer.y, dir, Infinity, ctx.controller)) {
        if (siteAt(ctx.state, s.x, s.y)) lastSite = s
      }
      bearer.carrying = bearer.carrying.filter((id) => id !== art.id)
      art.carriedBy = null
      art.x = lastSite.x
      art.y = lastSite.y
      pushLog(ctx.state, ctx.controller, 'Rhongomyniad pierces the field and stands quivering in the earth.')
      // codex Piercing Projectile: it hits only ONE unit at each location (the thrower picks when several
      // could be hit), ignoring allies at the starting location
      firePiercingProjectile(ctx.state, {
        player: ctx.controller, ox: bearer.x, oy: bearer.y, region: bearer.region,
        dir, damage: 3, excludeId: bearer.id, srcName: 'Rhongomyniad',
      })
    },
  },
})
