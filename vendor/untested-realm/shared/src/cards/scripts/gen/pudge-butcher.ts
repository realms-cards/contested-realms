import { registerScript, type EffectAPI } from '../registry'
import { pushLog } from '../../../engine/effects'
import { fightUnits, firstProjectileImpact } from '../../../engine/combat'

// 'Immobile / Tap → Shoot a projectile. If it hits a unit, drag it to this
//  location. Pudge may fight it when it arrives.'
// The hook is a normal projectile, so it obeys the shared projectile rules:
// the flight begins on Pudge's OWN square (enemies co-located with her ARE valid
// targets — the old hand-rolled loop stepped away first and ignored them), and
// when several hittable units share the impact square the SHOOTER chooses which
// one is hooked (never an engine auto-pick).
function pudgeDrag(ctx: EffectAPI, targetId: string): void {
  const self = ctx.state.units[ctx.sourceId]
  const hit = ctx.state.units[targetId]
  if (!self || !hit) return
  ctx.teleport(hit.id, self.x, self.y, self.region, { push: true }) // forced drag: Cage/push-ban/no-void aware
  pushLog(ctx.state, ctx.controller, `Pudge's hook drags ${hit.name} in!`)
  // "may fight it WHEN IT ARRIVES" — if the drag was blocked short (Perilous Bridge / Cage of Sidrak /
  // Bailey), the prey never reaches Pudge, so there is no fight AND no fight prompt.
  const arrived = !!ctx.state.units[hit.id] && hit.x === self.x && hit.y === self.y && hit.region === self.region
  if (arrived && hit.controller !== ctx.controller) {
    ctx.ask({ kind: 'yesNo', title: `Fight ${hit.name}?` }, 'chop', { preyId: hit.id })
  }
}

registerScript('Pudge Butcher', {
  abilities: [{
    key: 'hook',
    label: 'Throw the hook (projectile drag)',
    cost: { tap: true },
    effect: (ctx) => {
      ctx.ask({ kind: 'chooseOption', title: 'Throw the hook which way?', data: { options: ['n', 's', 'e', 'w'] } }, 'hook')
    },
  }],
  conts: {
    hook: (ctx, _c, dir) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || typeof dir !== 'string') return
      const impact = firstProjectileImpact(ctx.state, {
        player: ctx.controller, ox: self.x, oy: self.y, region: self.region, dir, excludeId: self.id,
      })
      if (!impact) { pushLog(ctx.state, ctx.controller, 'The hook clatters against nothing.'); return }
      if (impact.candidates.length === 1) { pudgeDrag(ctx, impact.candidates[0]); return }
      ctx.ask({ kind: 'chooseTargets', title: 'Hook which unit?', data: { candidates: impact.candidates, count: 1, upTo: false, kind: 'unit' } }, 'hookPick')
    },
    hookPick: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (typeof id === 'string') pudgeDrag(ctx, id)
    },
    chop: (ctx, c, yes) => {
      const self = ctx.state.units[ctx.sourceId]
      const prey = ctx.state.units[c.preyId as string]
      // "may FIGHT it when it arrives" — a fight, not an attack (no defend window, no attack legality).
      // It must have ARRIVED at Pudge's square (a blocked drag → no fight).
      if (yes && self && prey && prey.x === self.x && prey.y === self.y && prey.region === self.region) {
        fightUnits(ctx.state, self, prey)
      }
    },
  },
})
