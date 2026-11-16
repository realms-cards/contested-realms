import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'
import { applyGrid, type Cell } from '../multi-card-utils/apply-grid'

// 'Genesis → Sacrifice this site to deal damage to each other unit at affected sites:'
// The printed grid (read off the card): 5 at Krakalak's own site, 3 at each of the eight sites around it.
// The sacrifice is the price of the blast: you can only sacrifice a site you control (codex Sacrifice), so
// on an enemy's site (or the void) nothing happens. No "may" is printed, so the Genesis is mandatory.
// Codex Sacrifice: a card sacrificed to pay for an effect stays put until the effect has resolved — so the
// blast lands first (Krakalak's own site still there, hitting the others on it, above and below), and only
// then is the site replaced by Rubble. "each unit at affected sites" = every region of a sited square, as
// Rite of Eruption reads it (a sited square has no void).
const KRAKALAK: Cell[] = [
  { dx: 0, dy: 0, dmg: 5 },
  { dx: 1, dy: 0, dmg: 3 }, { dx: -1, dy: 0, dmg: 3 }, { dx: 0, dy: 1, dmg: 3 }, { dx: 0, dy: -1, dmg: 3 },
  { dx: 1, dy: 1, dmg: 3 }, { dx: -1, dy: 1, dmg: 3 }, { dx: 1, dy: -1, dmg: 3 }, { dx: -1, dy: -1, dmg: 3 },
]

registerScript('King Krakalak', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const site = siteAt(ctx.state, self.x, self.y)
    if (!site || site.isRubble || site.controller !== ctx.controller) return ctx.log('King Krakalak has no site of yours to sacrifice.')
    applyGrid(ctx, { x: self.x, y: self.y }, KRAKALAK, 'n', { region: 'allRegions', atopSitesOnly: true, skipUnitId: self.id })
    ctx.settleDeaths()
    if (ctx.state.sites[site.id]) ctx.destroySite(site.id, undefined, true) // a sacrifice — never prevented
    ctx.log('🌋 King Krakalak tears his throne from the earth!')
  },
})
