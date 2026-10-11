import { registerScript, getScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { siteAt, unitsAt, inBounds } from '../../../engine/grid'
import { regionPresentAt, siteSilenced } from '../../../engine/statics'
import { siteEntryAllowed } from '../../../engine/movement'
import type { Step } from '../../../engine/types'

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
      const path: { x: number; y: number }[] = []
      let x = caster.x
      let y = caster.y
      if (!regionPresentAt(ctx.state, 'surface', x, y)) { x += d[0]; y += d[1] }
      while (inBounds(x, y) && regionPresentAt(ctx.state, 'surface', x, y)) {
        // a piercing projectile can't ENTER a projectile-blocking site (Impenetrable Copse) from
        // outside — the roll STOPS before it (units on/behind the cover are never swept up). The
        // start square is exempt (already there). Matches the arrows' reach (directionReach).
        const here = siteAt(ctx.state, x, y)
        if (path.length > 0 && here && getScript(here.name)?.blocksProjectiles && !siteSilenced(ctx.state, here)) break
        path.push({ x, y })
        x += d[0]
        y += d[1]
      }
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
      const lastIdx = path.length - 1
      const carried: { id: string; fromIdx: number }[] = []
      for (let i = 0; i < lastIdx; i++) {
        for (const u of unitsAt(ctx.state, path[i].x, path[i].y, 'surface')) {
          if (u.id !== caster.id) carried.push({ id: u.id, fromIdx: i }) // "all OTHER units" — never the caster
        }
      }
      for (const { id, fromIdx } of carried) {
        const u = ctx.state.units[id]
        if (!u) continue
        let idx = fromIdx
        while (idx < lastIdx) {
          const from: Step = { x: path[idx].x, y: path[idx].y, region: 'surface' }
          const to: Step = { x: path[idx + 1].x, y: path[idx + 1].y, region: 'surface' }
          if (!siteEntryAllowed(ctx.state, u, from, to)) break // can't enter the next site → drop here
          idx++
        }
        if (idx > fromIdx) ctx.teleport(id, path[idx].x, path[idx].y)
      }
      const packed = unitsAt(ctx.state, stop.x, stop.y, 'surface').filter((u) => u.id !== caster.id)
      const n = packed.length
      pushLog(ctx.state, ctx.controller, `⛄ The snowball thunders ${dir}ward, ${n} unit${n === 1 ? '' : 's'} packed inside!`)
      if (!n) return
      for (const u of packed) if (ctx.state.units[u.id]) ctx.dealDamage({ unit: u.id }, n)
    },
  },
})
