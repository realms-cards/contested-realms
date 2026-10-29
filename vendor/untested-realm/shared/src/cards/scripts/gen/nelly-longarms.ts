import { registerScript, type EffectAPI } from '../registry'
import { terrainAt } from '../../../engine/statics'
import { pushLog, trySubmerge } from '../../../engine/effects'
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
      // a projectile hit, not a target: a Ward doesn't break over it (Codex, Ward)
      ctx.ask(
        { kind: 'chooseTargets', title: 'Grab — which unit do you seize?', data: { candidates: impact.candidates, count: 1, kind: 'unit', notTargeted: true } },
        'grabPick',
        { selfId: self.id },
      )
    },
    grabPick: (ctx, contCtx, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (typeof id === 'string') grabPull(ctx, contCtx.selfId, id)
    },
    // once the drag is over: "Nelly may submerge it" only if it was dragged HERE (a drag blocked short, or
    // refused — can't be moved by force — leaves it elsewhere), and only over water
    arrived: (ctx, contCtx) => {
      const self = ctx.state.units[contCtx.selfId]
      const hit = ctx.state.units[contCtx.victim]
      if (!self || !hit || hit.isAvatar || hit.region !== 'surface') return
      if (hit.x !== self.x || hit.y !== self.y || hit.region !== self.region) return
      if (terrainAt(ctx.state, self.x, self.y) !== 'water') return
      ctx.ask({ kind: 'yesNo', title: `Drag ${hit.name} underwater?` }, 'dunk', { selfId: self.id, victim: hit.id })
    },
    dunk: (ctx, contCtx, choice) => {
      const u = ctx.state.units[contCtx.victim]
      // submerging it is forced movement too: trySubmerge honours "can't be moved by force" / Anchorman and drowns it
      if (choice && u && trySubmerge(ctx.state, u, ctx.controller)) pushLog(ctx.state, ctx.controller, `${u.name} is dragged beneath the surface!`)
    },
  },
})

// seize the grabbed unit to this square; `arrived` then offers to drag it under
function grabPull(ctx: EffectAPI, selfId: string, hitId: string) {
  const self = ctx.state.units[selfId]
  const hit = ctx.state.units[hitId]
  if (!self || !hit) return
  // a forced drag: respects Cage of Sidrak / push-bans / no void; `arrived` once the drag is over, which a
  // trigger on the way may hold up (a Troll Bridge's toll)
  ctx.teleport(hitId, self.x, self.y, self.region, { push: true, then: { key: 'arrived', ctx: { selfId, victim: hitId } } })
}
