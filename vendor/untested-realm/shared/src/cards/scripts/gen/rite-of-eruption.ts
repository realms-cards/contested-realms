import { registerScript } from '../registry'
import { destroyTogether } from '../multi-card-utils/destroy-together'
import { siteAt, unitsAt } from '../../../engine/grid'
import { applyGrid, CROSS_3X3, type Cell } from '../multi-card-utils/apply-grid'
import { removeAura } from '../multi-card-utils/remove-aura'

// 'Conjure to a single site. At the start of your turn, deal damage to each unit at affected sites, then
// destroy everything in this square: 5 at its site, 3 at each orthogonally adjacent site, and 1 at each
// diagonally adjacent site.'
// The grid only hits sites, and "each unit at affected sites" is every unit at a site's locations — on it
// and below it (a sited square has no void). Then everything in its square goes: every minion there
// (above and below), the artifacts, the site (to Rubble) and the Rite itself.
const ERUPTION: Cell[] = CROSS_3X3.map((c) => ({ ...c, dmg: c.dmg === 7 ? 5 : c.dmg === 5 ? 3 : 1 }))

registerScript('Rite of Eruption', {
  singleSiteAura: true,
  auraPlacement: (state, _player, at) => (siteAt(state, at.x, at.y) ? null : 'Rite of Eruption must be conjured to a site.'),
  startOfTurn: (ctx) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (!aura?.squares.length) return
    const sq = aura.squares[0]
    applyGrid(ctx, sq, ERUPTION, 'n', { region: 'allRegions', atopSitesOnly: true })
    ctx.settleDeaths()
    destroyTogether(
      ctx,
      unitsAt(ctx.state, sq.x, sq.y).map((u) => u.id),
      Object.values(ctx.state.artifacts).filter((a) => a.x === sq.x && a.y === sq.y).map((a) => a.id),
    )
    const site = siteAt(ctx.state, sq.x, sq.y)
    if (site && !site.isRubble) ctx.destroySite(site.id)
    removeAura(ctx)
    ctx.log('🌋 The rite is complete — the land erupts!')
  },
})
