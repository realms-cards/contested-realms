import { registerScript } from '../registry'
import { tapUnit } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'
import { realStepDistanceW } from '../../../engine/movement'
import { canTapForCost } from '../../../engine/statics'
import { validateTarget } from '../../../engine/casting'

// 'Tap bearer and another ally here → Deal 3 damage to target unit up to two steps away.'
registerScript('Siege Ballista', {
  abilities: [{
    key: 'ballista',
    label: 'Tap bearer + an ally → 3 damage (≤2 steps)',
    cost: {},
    effect: (ctx) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      const bearer = art?.carriedBy ? ctx.state.units[art.carriedBy] : null
      if (!art || !bearer) return ctx.log('No one mans the ballista.')
      if (!canTapForCost(ctx.state, bearer)) return ctx.log('The bearer cannot be tapped to pay for this.')
      const crew = unitsAt(ctx.state, bearer.x, bearer.y, bearer.region).filter(
        (u) => u.id !== bearer.id && u.controller === ctx.controller && canTapForCost(ctx.state, u),
      )
      if (!crew.length) return ctx.log('The ballista needs a second crew member here.')
      ctx.ask({ kind: 'chooseTargets', title: 'Who helps crank the ballista?', data: { candidates: crew.map((u) => u.id), count: 1, upTo: false, kind: 'unit' } }, 'crew')
    },
  }],
  conts: {
    crew: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const art = ctx.state.artifacts[ctx.sourceId]
      const bearer = art?.carriedBy ? ctx.state.units[art.carriedBy] : null
      const helper = typeof id === 'string' ? ctx.state.units[id] : null
      if (!bearer || !helper || !canTapForCost(ctx.state, helper) || !canTapForCost(ctx.state, bearer)) return
      tapUnit(ctx.state, bearer)
      tapUnit(ctx.state, helper)
      // "target unit up to two steps away" (def. 1): a real target — same region as the bearer, and Stealth
      // (an enemy's), targeting sanctuaries and the Earl's "not by the Ordinary" all apply
      const spec = { what: 'unit' as const, count: 1, targeted: true, label: 'target unit' }
      const targets = Object.values(ctx.state.units)
        .filter((u) => u.id !== bearer.id && realStepDistanceW(ctx.state, u, bearer) <= 2 && !validateTarget(ctx.state, spec, { unit: u.id }, bearer, ctx.controller, undefined, 'Siege Ballista'))
        .map((u) => u.id)
      if (!targets.length) return
      ctx.ask({ kind: 'chooseTargets', title: 'The bolt flies at whom?', data: { candidates: targets, count: 1, upTo: false, kind: 'unit' } }, 'loose')
    },
    loose: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (typeof id === 'string' && ctx.state.units[id]) ctx.dealDamage({ unit: id }, 3)
    },
  },
})
