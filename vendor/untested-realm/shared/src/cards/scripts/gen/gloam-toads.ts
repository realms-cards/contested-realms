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
      // forced drag: Cage/push-ban/no-void aware. "may strike it when it ARRIVES": only if the drag
      // brought it here (not refused, not killed on the way, not already sharing the Toads' location)
      const left = ctx.teleport(u.id, self.x, self.y, self.region, { push: true })
      const there = ctx.state.units[u.id]
      if (left && there && there.x === self.x && there.y === self.y && there.region === self.region) {
        ctx.ask({ kind: 'yesNo', title: `Strike ${u.name}?` }, 'gulp', { victim: u.id })
      }
    },
  }],
  conts: {
    gulp: (ctx, contCtx, choice) => {
      const self = ctx.state.units[ctx.sourceId]
      const v = ctx.state.units[contCtx.victim]
      if (choice && self && v && v.x === self.x && v.y === self.y && v.region === self.region) ctx.strike(self, { unit: v.id })
    },
  },
})
