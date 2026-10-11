import { registerScript, type EffectAPI } from '../registry'
import { terrainAt } from '../../../engine/statics'
import { checkStateBased } from '../../../engine/effects'
import { firstProjectileImpact } from '../../../engine/combat'

// 'Submerge / Tap → Shoot a projectile. If it hits a unit, drag it here. Nelly may submerge it.'
registerScript('Nelly Longarms', {
  abilities: [{
    key: 'arms',
    label: 'Tap → Grab a unit from afar',
    cost: { tap: true },
    effect: (ctx) => {
      ctx.ask({ kind: 'chooseOption', title: 'Reach in which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'grab')
    },
  }],
  conts: {
    grab: (ctx, _c, dir) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || !dir) return
      const impact = firstProjectileImpact(ctx.state, { player: ctx.controller, ox: self.x, oy: self.y, region: self.region, dir: String(dir), excludeId: self.id })
      if (!impact) return
      if (impact.candidates.length === 1) return grabPull(ctx, self.id, impact.candidates[0])
      ctx.ask(
        { kind: 'chooseTargets', title: 'Grab — which unit do you seize?', data: { candidates: impact.candidates, count: 1, kind: 'unit' } },
        'grabPick',
        { selfId: self.id },
      )
    },
    grabPick: (ctx, contCtx, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (typeof id === 'string') grabPull(ctx, contCtx.selfId, id)
    },
    dunk: (ctx, contCtx, choice) => {
      const u = ctx.state.units[contCtx.victim]
      if (choice && u) {
        u.region = 'underwater'
        checkStateBased(ctx.state)
      }
    },
  },
})

// seize the grabbed unit to this square, then (over water) offer to drag it under
function grabPull(ctx: EffectAPI, selfId: string, hitId: string) {
  const self = ctx.state.units[selfId]
  const hit = ctx.state.units[hitId]
  if (!self || !hit) return
  ctx.teleport(hitId, self.x, self.y, self.region, { push: true }) // a forced drag: respects Cage of Sidrak / push-bans / no void
  if (ctx.state.units[hitId] && terrainAt(ctx.state, self.x, self.y) === 'water' && !hit.isAvatar) {
    ctx.ask({ kind: 'yesNo', title: `Drag ${hit.name} underwater?` }, 'dunk', { victim: hitId })
  }
}
