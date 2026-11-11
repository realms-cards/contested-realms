import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'
import { regionPresentAt } from '../../../engine/statics'
import { surfaceSweepPath, carryAlongPath } from '../multi-card-utils/surface-sweep'

// -------------------------------------------------------------- Snowball ----
// 'Shoot a piercing projectile. It picks up all other units along its path and
//  carries them with it. When it stops, units there take damage equal to the
//  number of units in the snowball.'
registerScript('Snowball', {
  onCast: (ctx) => {
    // the direction arrows (reachable lanes + element colour) are attached generically by ctx.ask
    ctx.ask({ kind: 'chooseOption', title: 'Snowball rolls in which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'roll')
  },
  conts: {
    roll: (ctx, _c, dir) => {
      const caster = ctx.caster
      if (!caster || typeof dir !== 'string') return
      const d = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }[dir as 'n' | 's' | 'e' | 'w']!
      // a piercing projectile: the roll travels the surface and STOPS at the void (a siteless
      // square is a different region — the snowball can't cross it). FAQ: "the path includes both
      // the starting and ending locations" — the START is the caster's OWN square, so units
      // co-located with the caster (an enemy sharing its site) are "along its path" and get swept
      // up too — every OTHER unit, never the caster. If the caster stands on the VOID (no site — it
      // can't begin a roll from a siteless square), the snowball launches from the first surface
      // square in the chosen direction instead.
      // A piercing projectile can't ENTER a projectile-blocking site (Impenetrable Copse) from outside —
      // the roll STOPS before it (units on/behind the cover are never swept up). Matches the arrows' reach.
      const onSurface = regionPresentAt(ctx.state, 'surface', caster.x, caster.y)
      const start = onSurface ? { x: caster.x, y: caster.y } : { x: caster.x + d[0], y: caster.y + d[1] }
      const path = surfaceSweepPath(ctx.state, start, { dx: d[0], dy: d[1] }, true)
      if (path.length < 2) return // the snowball must actually roll at least one square
      const stop = path[path.length - 1]
      // Roll every OTHER unit along the path onto the stop square (units already AT the stop stay
      // put; the caster is never picked up by its own snowball). move-protection is honored inside
      // teleport. Do NOT count as we teleport (a unit rolled to `stop` would be re-counted when the
      // loop reaches the stop square) — count the DISTINCT units packed on the stop afterwards.
      // Carry every OTHER unit along the path toward the stop — but a unit that CAN'T ENTER a site
      // on the way (an enemy blocked by a Bailey / Great Wall it may not cross) is DROPPED at the
      // last square it may legally occupy: it leaves the snowball, so it never reaches the stop and
      // is NOT among the units that take the final damage. Snapshot the carried units first (with
      // their path index) so a unit rolled forward isn't picked up and re-rolled by a later square.
      carryAlongPath(ctx, path, caster.id) // "all OTHER units" — never the caster
      const packed = unitsAt(ctx.state, stop.x, stop.y, 'surface').filter((u) => u.id !== caster.id)
      const n = packed.length
      pushLog(ctx.state, ctx.controller, `⛄ The snowball thunders ${dir}ward, ${n} unit${n === 1 ? '' : 's'} packed inside!`)
      if (!n) return
      for (const u of packed) if (ctx.state.units[u.id]) ctx.dealDamage({ unit: u.id }, n)
    },
  },
})
