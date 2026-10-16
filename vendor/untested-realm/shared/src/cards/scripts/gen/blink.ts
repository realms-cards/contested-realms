import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// 'An ally teleports to a location it's nearby. Draw a card.'
registerScript('Blink', {
  targets: [
    { what: 'unit', count: 1, targeted: false, owner: 'ally', label: 'an ally' },
    // the destination must be NEARBY THE ALLY (target 0), not the caster — enforced at selection now
    // (whereOf), so the UI only offers legal squares instead of accepting one and fizzling on resolution.
    { what: 'square', count: 1, targeted: false, where: 'nearby', whereOf: 0, label: 'a nearby location' },
  ],
  // the ally + destination are chosen targets; the client reads this to offer an oversized-placement
  // picker when the ally occupies multiple squares (2x2 corner / wall / Megamoeba rotation).
  teleportPlacement: (_state, targets) =>
    'unit' in targets[0] && 'square' in targets[1] ? { unitId: targets[0].unit, dest: targets[1].square } : null,
  onCast: (ctx) => {
    const [tu, ts] = ctx.targets
    if ('unit' in tu && 'square' in ts) {
      const u = ctx.state.units[tu.unit]
      const dest = ts.square
      // validated nearby-the-ally at cast time; the guard stays as belt-and-suspenders
      if (u && nearbySquaresW(ctx.state, u.x, u.y).some((s) => s.x === dest.x && s.y === dest.y)) {
        // a multi-square ally's chosen placement/rotation (client picker) is applied inside ctx.teleport
        // via flow.teleportPlace — any teleport spell honours it, so nothing special is needed here.
        ctx.teleport(u.id, dest.x, dest.y, dest.region ?? u.region)
      }
    }
    ctx.drawCard(ctx.controller)
  },
})
