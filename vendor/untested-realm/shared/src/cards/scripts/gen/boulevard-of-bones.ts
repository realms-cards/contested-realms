import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { orthAdjacentWrapped } from '../../../engine/grid'

// 'Whenever another site is played to an adjacent square, summon a Skeleton token there.'
registerScript('Boulevard of Bones', {
  onSitePlayed: (ctx, _by, site) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || site.id === self.id) return
    if (!orthAdjacentWrapped(ctx.state, self.x, self.y).some((s) => s.x === site.x && s.y === site.y)) return
    // the summon can be forbidden at the target site (No Man's Land) — only crow about it if one rose
    if (ctx.summonToken('Skeleton', ctx.controller, site.x, site.y)) {
      pushLog(ctx.state, ctx.controller, 'Bones rattle up from beneath the boulevard.')
    }
  },
})
