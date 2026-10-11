import { registerScript, type EffectAPI } from '../registry'
import { pushLog } from '../../../engine/effects'
import { firstProjectileImpact } from '../../../engine/combat'

// 'Shoot a projectile. It deals 4 damage on impact, then changes direction. Its
// next impact deals 2, then it changes direction. Its final impact deals 1.'
registerScript('Ball Lightning', {
  shootsProjectile: true,
  onCast: (ctx) => {
    const dir = ctx.extra?.direction
    const caster = ctx.caster!
    if (!dir) return ctx.log('No direction chosen.')
    bounce(ctx, { x: caster.x, y: caster.y }, String(dir), 4, [], true)
  },
  conts: {
    // the shooter chose which co-located unit this impact strikes
    blHit: (ctx, contCtx, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (typeof id === 'string') ballLightningHit(ctx, id, contCtx.dmg, (contCtx.hit as string[]) ?? [])
    },
    rebound: (ctx, contCtx, dir) => {
      if (!dir) return
      bounce(ctx, contCtx.from, String(dir), contCtx.dmg, (contCtx.hit as string[]) ?? [], false)
    },
  },
})

// `hit` = units already struck this chain. The INITIAL shot fires outward from the caster and never
// hits it; a bounce-back CAN hit the caster and allies (projectiles don't discriminate), but no unit
// may be struck twice in one Ball Lightning chain — so already-hit units are passed through.
function bounce(ctx: EffectAPI, from: { x: number; y: number }, dir: string, dmg: number, hit: string[], firstShot: boolean) {
  const caster = ctx.caster!
  const impact = firstProjectileImpact(ctx.state, { player: ctx.controller, ox: from.x, oy: from.y, region: 'surface', dir, filter: 'notStealth', excludeId: firstShot ? caster.id : undefined, excludeIds: hit })
  if (!impact) return pushLog(ctx.state, ctx.controller, 'The lightning dissipates.')
  if (impact.candidates.length === 1) return ballLightningHit(ctx, impact.candidates[0], dmg, hit)
  ctx.ask(
    { kind: 'chooseTargets', title: `Ball Lightning (${dmg} dmg) — which unit does it hit?`, data: { candidates: impact.candidates, count: 1, kind: 'unit' } },
    'blHit',
    { dmg, hit },
  )
}

// deal this impact's damage to the chosen unit, then (if >1) bounce onward from
// its location for the reduced next hit — the direction is the shooter's choice.
function ballLightningHit(ctx: EffectAPI, id: string, dmg: number, hit: string[]) {
  const u = ctx.state.units[id]
  if (!u) return
  const from = { x: u.x, y: u.y }
  ctx.dealDamage({ unit: id }, dmg)
  const nextHit = [...hit, id]
  if (dmg > 1) {
    ctx.ask(
      { kind: 'chooseOption', title: `Ball Lightning rebounds (next hit: ${dmg === 4 ? 2 : 1}) — direction?`, data: { options: ['n', 's', 'e', 'w'] } },
      'rebound',
      { from, dmg: dmg === 4 ? 2 : 1, hit: nextHit },
    )
  }
}
