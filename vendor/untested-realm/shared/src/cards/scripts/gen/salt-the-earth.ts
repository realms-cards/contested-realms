import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'

// 'Conjure Salt the Earth to a single site, destroying it. / Sites can't be played here.'
// A single-site aura (like Hamlet's Ablaze!): it covers the ONE site it's conjured to. The destroyed site
// becomes rubble as usual (rulebook) — the salt stays on the rubble, so no site can be played there again.
registerScript('Salt the Earth', {
  singleSiteAura: true,
  auraPlacement: (state, _player, at) => (siteAt(state, at.x, at.y) ? null : 'Salt the Earth must be conjured atop a site.'),
  auraBlocksSitePlay: true,
  genesis: (ctx) => {
    const at = ctx.at
    if (!ctx.state.auras[ctx.sourceId] || !at) return
    const site = siteAt(ctx.state, at.x, at.y)
    if (site && !site.isRubble) {
      ctx.destroySite(site.id)
      pushLog(ctx.state, ctx.controller, 'The land is sown with salt — nothing will ever grow here.')
    }
  },
})
