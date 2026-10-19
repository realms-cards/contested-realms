import { registerScript, type EffectAPI } from '../registry'
import { fireVolleyProjectiles } from '../../../engine/combat'

// 'Shoot three projectiles, one at a time. Each deals 1 damage but melts before the third step.'
// Unlike Magic Missiles / Firebolts ("in the same direction"), each shard picks its OWN direction: the
// first uses the direction chosen at cast, then the caster aims shards two and three one at a time.
const SHARDS = 3

function shoot(ctx: EffectAPI, origin: { x: number; y: number; region: any }, dir: string, shot: number): void {
  // melts before the third step → range capped at 2
  fireVolleyProjectiles(ctx.state, {
    player: ctx.controller, ox: origin.x, oy: origin.y, region: origin.region,
    dir, volleys: 1, damage: 1, maxRange: 2, excludeId: ctx.caster?.id, srcName: 'Ice Shards',
  })
  // queued behind any "which unit does it hit?" prompt this shard opened, so shots stay one at a time
  if (shot < SHARDS) {
    ctx.ask(
      { kind: 'chooseOption', title: `Ice Shards — shard ${shot + 1} of ${SHARDS}: which direction?`, data: { options: ['n', 's', 'e', 'w'] } },
      'aim',
      { origin, shot: shot + 1 },
    )
  }
}

registerScript('Ice Shards', {
  shootsProjectile: true,
  onCast: (ctx) => {
    const dir = ctx.extra?.direction
    const caster = ctx.caster!
    if (!dir) return ctx.log('No direction chosen.')
    shoot(ctx, { x: caster.x, y: caster.y, region: caster.region }, String(dir), 1)
  },
  conts: {
    aim: (ctx, c, dir) => {
      if (typeof dir !== 'string' || !['n', 's', 'e', 'w'].includes(dir)) return
      shoot(ctx, c.origin as { x: number; y: number; region: any }, dir, c.shot as number)
    },
  },
})
