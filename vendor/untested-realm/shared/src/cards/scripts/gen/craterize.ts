import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { Cell, applyGrid, diamondCells, resolveCells } from '../multi-card-utils/apply-grid'

// 'As an additional cost, discard a site. Destroy target site and deal damage to
// each unit above or below a site in the area: 5x5 [1 2 4 2 1 / 2 4 7 4 2 /
// 4 7 10 7 4 / 2 4 7 4 2 / 1 2 4 2 1]'
const CRATERIZE_CELLS: Cell[] = diamondCells((d) => [10, 7, 4, 2, 1][d] ?? 0)

registerScript('Craterize', {
  extraCastCheck: (state, player) => {
    const hasSite = state.players[player].hand.some((id) => getCard(state.cards[id].name).type === 'Site')
    return hasSite ? null : 'You must discard a site to cast Craterize.'
  },
  areaDamage: (state, _casterId, params) => {
    const site = params.sites?.[0] ? state.sites[params.sites[0]] : null
    if (!site) return null
    return resolveCells(state, { x: site.x, y: site.y }, CRATERIZE_CELLS, 'n', { atopSitesOnly: true })
  },
  targets: [{ what: 'site', count: 1, targeted: true, label: 'target site (ground zero)' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('site' in t)) return
    // COST: "discard a site" — the caster chooses which when holding several
    ctx.discardChoose(ctx.controller, { title: 'Craterize — discard which site?', filter: (name) => getCard(name).type === 'Site' })
    const site = ctx.state.sites[t.site]
    if (!site) return
    const origin = { x: site.x, y: site.y }
    ctx.destroySite(site.id)
    // above AND below (FAQ: surface, underground and underwater alike)
    applyGrid(ctx, origin, CRATERIZE_CELLS, 'n', { region: 'allRegions', atopSitesOnly: true })
    pushLog(ctx.state, ctx.controller, '💥 A crater where a site once stood.')
  },
})
