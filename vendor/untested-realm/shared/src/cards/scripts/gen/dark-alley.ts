import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'The first minion that enters here gains Stealth.'
// onUnitEntersSquare covers walking/teleporting in AND being summoned/conjured
// here (the engine now fires it on summon too — see emitUnitEnters).
// A site's "here" is any of its locations (surface OR subsurface), so submerging/burrowing IN
// from outside the site counts. `from` outside the site distinguishes a real entry from an
// in-place region change (which never emits an enter event anyway).
registerScript('Dark Alley', {
  onUnitEntersSquare: (ctx, moved, from) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || moved.isAvatar) return
    if (moved.x !== self.x || moved.y !== self.y) return
    if (from.x === self.x && from.y === self.y) return // was already at this site — not "entering"
    if ((self as any).usedAlley) return // one-time: only the FIRST minion
    ;(self as any).usedAlley = true
    const u = ctx.state.units[moved.id]
    if (u) {
      u.stealth = true
      pushLog(ctx.state, ctx.controller, `${u.name} slips into the shadows of the Dark Alley.`)
    }
  },
})
