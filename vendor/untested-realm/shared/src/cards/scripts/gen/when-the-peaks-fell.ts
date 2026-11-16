import { registerScript } from '../registry'
import { surfaceSweepPath, carryAlongPath } from '../multi-card-utils/surface-sweep'
import { disableUntilYourNextTurn } from '../multi-card-utils/disable-until-next-turn'

// 'Choose any number of allied sites. Snow rolls forward from them, picking up surface units in its path
//  and carrying them as far as possible. When it stops, they take 3 damage and are disabled until your
//  next turn.'
// Each chosen site sends snow forward (away from the caster's starting edge) like Avalanche's: along the
// surface to the edge or the void, sweeping every surface unit on the way toward where it stops. The sites
// aren't targeted. Snows nearer the caster's back row roll first. FAQ rulings:
//  · snow that doesn't move at all (it starts at the last site before the edge or the void) doesn't
//    "stop" — it affects no one (another snow rolling onto those units still can);
//  · a unit that doesn't end up where its snow stops (can't be moved by force, can't enter a site on the
//    way) isn't affected;
//  · each unit takes the 3 damage only once, after all the snow has stopped, and the damage and the disable
//    are simultaneous: ongoing abilities still shape the damage, but a minion killed by it is disabled as
//    it dies, so no Deathrite.
registerScript('When the Peaks Fell', {
  onCast: (ctx) => {
    const mine = Object.values(ctx.state.sites).filter((s) => s.controller === ctx.controller && !s.isRubble)
    if (!mine.length) return ctx.log('No allied site for the snow to fall from.')
    ctx.ask({ kind: 'chooseTargets', title: 'When the Peaks Fell: snow rolls forward from which allied sites?', data: { candidates: mine.map((s) => s.id), count: mine.length, upTo: true, kind: 'site', notTargeted: true } }, 'roll')
  },
  conts: {
    roll: (ctx, _c, choice) => {
      const ids = Array.isArray(choice) ? choice : typeof choice === 'string' ? [choice] : []
      const forward = ctx.controller === 0 ? 1 : -1
      const sites = [...new Set(ids)]
        .map((id) => ctx.state.sites[id as string])
        .filter((s) => !!s && s.controller === ctx.controller)
        .sort((a, b) => (a.y - b.y) * forward)
      const hit = new Set<string>()
      for (const site of sites) {
        const path = surfaceSweepPath(ctx.state, { x: site.x, y: site.y }, { dx: 0, dy: forward }, false)
        if (path.length < 2) continue // the snow never moves, so it never stops
        const end = path[path.length - 1]
        for (const u of carryAlongPath(ctx, path)) {
          if (u.x === end.x && u.y === end.y && u.region === 'surface') hit.add(u.id)
        }
      }
      const swept = [...hit].filter((id) => ctx.state.units[id])
      if (!swept.length) return ctx.log('The snow thunders down on empty ground.')
      // one effect: the deaths wait until it ends, by which time every victim is disabled
      for (const id of swept) ctx.dealDamage({ unit: id }, 3)
      for (const id of swept) disableUntilYourNextTurn(ctx, id, ctx.controller)
      ctx.log(`❄ The peaks fall — ${swept.length} unit${swept.length === 1 ? ' is' : 's are'} buried in snow!`)
    },
  },
})
