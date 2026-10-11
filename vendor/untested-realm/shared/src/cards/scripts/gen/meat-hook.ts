import { registerScript, type EffectAPI } from '../registry'
import { firstProjectileImpact, fightUnits } from '../../../engine/combat'

// 'Bearer has "Tap → Shoot a projectile. If a unit is hit, drag it here, and
// bearer may fight it when it arrives."'
registerScript('Meat Hook', {
  abilities: [{
    key: 'hook',
    label: 'Tap bearer → Hook a unit in',
    cost: {},
    effect: (ctx) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      const bearer = art?.carriedBy ? ctx.state.units[art.carriedBy] : null
      if (!art || !bearer || bearer.tapped) return ctx.log('The bearer must be untapped.')
      bearer.tapped = true
      ctx.ask({ kind: 'chooseOption', title: 'Hook in which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'hook', { bearerId: bearer.id })
    },
  }],
  conts: {
    hook: (ctx, contCtx, dir) => {
      const bearer = ctx.state.units[contCtx.bearerId]
      if (!bearer || !dir) return
      const impact = firstProjectileImpact(ctx.state, { player: ctx.controller, ox: bearer.x, oy: bearer.y, region: bearer.region, dir: String(dir), excludeId: bearer.id })
      if (!impact) return ctx.log('The hook comes back empty.')
      if (impact.candidates.length === 1) return hookPull(ctx, bearer.id, impact.candidates[0])
      ctx.ask(
        { kind: 'chooseTargets', title: 'Fish Hook — which unit do you snag?', data: { candidates: impact.candidates, count: 1, kind: 'unit' } },
        'hookPick',
        { bearerId: bearer.id },
      )
    },
    hookPick: (ctx, contCtx, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (typeof id === 'string') hookPull(ctx, contCtx.bearerId, id)
    },
    gaff: (ctx, contCtx, choice) => {
      if (!choice) return
      const a = ctx.state.units[contCtx.bearerId]
      const b = ctx.state.units[contCtx.victim]
      if (!a || !b) return
      // "may fight it when it arrives" — only if the pull actually landed it at the bearer's square.
      if (b.x !== a.x || b.y !== a.y || b.region !== a.region) return
      fightUnits(ctx.state, a, b) // a real fight: both strike (fires Interrogator, Lethal, kill triggers…)
    },
  },
})

// pull the hooked unit to the bearer's square, then offer to fight it
function hookPull(ctx: EffectAPI, bearerId: string, hitId: string) {
  const bearer = ctx.state.units[bearerId]
  const hit = ctx.state.units[hitId]
  if (!bearer || !hit) return
  ctx.teleport(hitId, bearer.x, bearer.y, bearer.region, { push: true }) // a hook/pull, not a Teleport (Perilous Bridge / Cage of Sidrak)
  // "may fight it WHEN IT ARRIVES" — a drag blocked short (Perilous Bridge / Cage / Bailey) lands the
  // prey nowhere near the bearer, so no fight AND no fight prompt.
  const arrived = !!ctx.state.units[hitId] && hit.x === bearer.x && hit.y === bearer.y && hit.region === bearer.region
  if (arrived) ctx.ask({ kind: 'yesNo', title: `Fight ${hit.name}?` }, 'gaff', { bearerId, victim: hitId })
}
