import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'

// 'Conjure Salt the Earth to a single site, destroying it. / Sites can't be played here.'
registerScript('Salt the Earth', {
  auraPlacement: (state, _player, at) => (siteAt(state, at.x, at.y) ? null : 'Salt the Earth must be conjured atop a site.'),
  auraBlocksSitePlay: true,
  genesis: (ctx) => {
    const aura = ctx.state.auras[ctx.sourceId]
    const at = ctx.at
    if (!aura || !at) return
    aura.squares = [{ x: at.x, y: at.y }]
    const site = siteAt(ctx.state, at.x, at.y)
    if (site) {
      ctx.destroySite(site.id)
      // salt the very rubble: nothing grows here again
      const rubble = siteAt(ctx.state, at.x, at.y)
      if (rubble) delete ctx.state.sites[rubble.id]
      pushLog(ctx.state, ctx.controller, 'The land is sown with salt — nothing will ever grow here.')
    }
  },
})
