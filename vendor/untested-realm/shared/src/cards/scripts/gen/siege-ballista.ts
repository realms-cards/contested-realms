import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { realStepDistanceW } from '../../../engine/movement'

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
      if (bearer.tapped) return ctx.log('The bearer is already tapped.')
      const crew = unitsAt(ctx.state, bearer.x, bearer.y, bearer.region).filter(
        (u) => u.id !== bearer.id && u.controller === ctx.controller && !u.tapped,
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
      if (!bearer || !helper || helper.tapped || bearer.tapped) return
      bearer.tapped = true
      helper.tapped = true
      const targets = Object.values(ctx.state.units).filter((u) => u.region === bearer.region && realStepDistanceW(ctx.state, u, bearer) <= 2 && u.id !== bearer.id).map((u) => u.id) // "up to two steps away" (def. 1); region-locked to the bearer
      if (!targets.length) return
      ctx.ask({ kind: 'chooseTargets', title: 'The bolt flies at whom?', data: { candidates: targets, count: 1, upTo: false, kind: 'unit' } }, 'loose')
    },
    loose: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (typeof id === 'string' && ctx.state.units[id]) ctx.dealDamage({ unit: id }, 3)
    },
  },
})
