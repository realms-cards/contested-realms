import { registerScript, type EffectAPI } from '../registry'
import { sitesOf } from '../../../engine/grid'

// 'Sacrifice a site to draw three sites.' — one of your own sites; no site to give, no draw.
registerScript('Ash of Effort', {
  extraCastCheck: (state, player) => (sitesOf(state, player).some((s) => !s.isRubble) ? null : 'You have no site to sacrifice.'),
  onCast: (ctx) => {
    const mine = sitesOf(ctx.state, ctx.controller).filter((s) => !s.isRubble)
    if (!mine.length) return
    if (mine.length === 1) return sacrificeAndDraw(ctx, mine[0].id)
    ctx.ask({ kind: 'chooseTargets', title: 'Ash of Effort: sacrifice which site?', data: { candidates: mine.map((s) => s.id), count: 1, kind: 'site', notTargeted: true, upTo: false } }, 'sacrifice')
  },
  conts: {
    sacrifice: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (typeof id === 'string') sacrificeAndDraw(ctx, id)
    },
  },
})

function sacrificeAndDraw(ctx: EffectAPI, siteId: string): void {
  const site = ctx.state.sites[siteId]
  if (!site || site.isRubble || site.controller !== ctx.controller) return
  ctx.destroySite(siteId, ctx.controller, true) // a willing sacrifice (bypasses can't-be-destroyed / Ward)
  ctx.draw(ctx.controller, 'atlas', 3)
}
