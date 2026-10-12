import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { hasSubtype } from '../../../engine/statics'
import { fireVolleyProjectiles } from '../../../engine/combat'

// 'Tap an allied Faerie here → Shoot a projectile. It deals 1 damage.'
registerScript('Fae City', {
  abilities: [{
    key: 'faebolt',
    label: 'Tap a Faerie here → 1-damage projectile',
    cost: {},
    effect: (ctx) => {
      const self = ctx.state.sites[ctx.sourceId]
      if (!self) return
      // "a Faerie here" — a site's "here" spans its subsurface too (a Faerie is normally Airborne and
      // can't dive, but honor the rule if some effect put one under).
      const faeries = unitsAt(ctx.state, self.x, self.y).filter(
        (u) => u.controller === ctx.controller && !u.tapped && hasSubtype(ctx.state, u, 'Faerie'),
      )
      if (faeries.length === 0) return ctx.log('No untapped Faerie here.')
      if (faeries.length === 1) {
        faeries[0].tapped = true
        ctx.ask({ kind: 'chooseOption', title: 'Shoot in which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'bolt')
        return
      }
      // "Tap AN allied Faerie" — the controller chooses which one to tap
      ctx.ask({ kind: 'chooseTargets', title: 'Tap which allied Faerie?', data: { candidates: faeries.map((u) => u.id), count: 1, kind: 'unit' } }, 'pickFae')
    },
  }],
  conts: {
    pickFae: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const fae = id ? ctx.state.units[id] : null
      if (!fae) return
      fae.tapped = true
      ctx.ask({ kind: 'chooseOption', title: 'Shoot in which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'bolt')
    },
    bolt: (ctx, _c, dir) => {
      const self = ctx.state.sites[ctx.sourceId]
      if (!self || !dir) return
      fireVolleyProjectiles(ctx.state, {
        player: ctx.controller, ox: self.x, oy: self.y, region: 'surface',
        dir: String(dir), volleys: 1, damage: 1, srcName: self.name,
      })
    },
  },
})
