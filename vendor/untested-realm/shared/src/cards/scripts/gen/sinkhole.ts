import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { nearbySquaresW } from '../../../engine/grid'

// ---------- sites ----------

// 'Sacrifice Sinkhole → Destroy a nearby site.'
registerScript('Sinkhole', {
  abilities: [{
    key: 'collapse',
    label: 'Sacrifice → Destroy a nearby site',
    cost: {},
    // where:'nearby' anchors on the site itself (game.ts abilityAnchor); the
    // in-effect nearby check + self-exclusion stay as belt-and-braces.
    targets: [{ what: 'site', count: 1, targeted: false, where: 'nearby', label: 'a nearby site' }],
    effect: (ctx) => {
      const self = ctx.state.sites[ctx.sourceId]
      const t = ctx.targets[0]
      if (!self || !t || !('site' in t)) return
      const victim = ctx.state.sites[t.site]
      if (!victim || victim.id === self.id) return
      if (!nearbySquaresW(ctx.state, self.x, self.y).some((s) => s.x === victim.x && s.y === victim.y)) return ctx.log('Not nearby.')
      ctx.destroySite(victim.id) // a real destruction — Sacred Oak etc. still protect the victim
      ctx.destroySite(self.id, undefined, true) // Sinkhole SACRIFICES itself (not destruction) — never blocked
      pushLog(ctx.state, ctx.controller, 'The ground gives way with a roar.')
    },
  }],
})
