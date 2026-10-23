import { registerScript } from '../registry'
import { nearbySquaresW, occupiedLocations } from '../../../engine/grid'
import { oversizedTeleportPlacements } from '../../../engine/movement'

// 'An ally teleports to a location it's nearby. Draw a card.'
// An OVERSIZED ally is nearby everything nearby any of its parts. The player picks the ANCHOR part first,
// then a location nearby that part, then the rotation — the anchor part lands on the location and the
// body turns around it (client sends extra.teleportPlace = { x, y, shape, from }).
registerScript('Blink', {
  targets: [
    { what: 'unit', count: 1, targeted: false, owner: 'ally', label: 'an ally' },
    // the destination must be NEARBY THE ALLY (target 0), not the caster — enforced at selection now
    // (whereOf), so the UI only offers legal squares instead of accepting one and fizzling on resolution.
    { what: 'square', count: 1, targeted: false, where: 'nearby', whereOf: 0, label: 'a nearby location' },
  ],
  // the ally + destination are chosen targets; the client reads this to offer the anchor-part and
  // placement pickers when the ally occupies multiple squares (2x2 corner / wall / Megamoeba rotation).
  teleportPlacement: (_state, targets) =>
    'unit' in targets[0] && 'square' in targets[1] ? { unitId: targets[0].unit, dest: targets[1].square } : null,
  onCast: (ctx) => {
    const [tu, ts] = ctx.targets
    if ('unit' in tu && 'square' in ts) {
      const u = ctx.state.units[tu.unit]
      const dest = ts.square
      const region = dest.region ?? u?.region
      // the parts of the ally this location is nearby (same region) — validated at cast time too
      const parts = u ? occupiedLocations(u).filter((p) => p.region === region && nearbySquaresW(ctx.state, p.x, p.y).some((s) => s.x === dest.x && s.y === dest.y)) : []
      if (u && parts.length) {
        const multi = u.size === '2x2' || (u.extraSquares?.length ?? 0) > 0
        if (multi) {
          // the chosen anchor must be a part this location is nearby; else (bot / no choice sent) default
          // to the unit's own anchor square if it reaches, otherwise the first part that does
          // (a placement sent without `from` is anchored on the unit's own anchor square, as before)
          const sent = ctx.state.flow?.teleportPlace as { from?: { x: number; y: number } } | undefined
          const chosen = sent ? sent.from ?? { x: u.x, y: u.y } : undefined
          const ok = chosen && parts.some((p) => p.x === chosen.x && p.y === chosen.y)
          if (!ok) {
            const from = parts.find((p) => p.x === u.x && p.y === u.y) ?? parts[0]
            const pl = oversizedTeleportPlacements(ctx.state, u, dest, from)[0]
            if (pl) ctx.state.flow.teleportPlace = { x: pl.x, y: pl.y, shape: pl.shape, from: pl.from }
            else delete ctx.state.flow.teleportPlace
          }
        }
        // the placement/rotation is applied inside ctx.teleport via flow.teleportPlace
        ctx.teleport(u.id, dest.x, dest.y, region!)
      }
    }
    ctx.drawCard(ctx.controller)
  },
})
