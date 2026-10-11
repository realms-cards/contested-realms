import { registerScript } from '../registry'

// 'Immobile / Tap → Drags in target adjacent unit and may strike it when it arrives.'
registerScript('Gloam Toads', {
  abilities: [{
    key: 'tongue',
    label: 'Tap → Drag in an adjacent unit',
    cost: { tap: true },
    targets: [{ what: 'unit', count: 1, targeted: true, where: 'adjacent', label: 'target adjacent unit' }],
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      const t = ctx.targets[0]
      if (!self || !t || !('unit' in t)) return
      const u = ctx.state.units[t.unit]
      if (!u) return // an avatar IS a valid "target adjacent unit" — drag (and may strike) it too
      ctx.teleport(u.id, self.x, self.y, self.region, { push: true }) // forced drag: Cage/push-ban/no-void aware
      if (ctx.state.units[u.id]) {
        ctx.ask({ kind: 'yesNo', title: `Strike ${u.name}?` }, 'gulp', { victim: u.id })
      }
    },
  }],
  conts: {
    gulp: (ctx, contCtx, choice) => {
      const self = ctx.state.units[ctx.sourceId]
      if (choice && self && ctx.state.units[contCtx.victim]) ctx.strike(self, { unit: contCtx.victim })
    },
  },
})
