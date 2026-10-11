import { registerScript } from '../registry'
import { adjacentSquaresW } from '../../../engine/grid'

// 'Once on your turn, you may flood an adjacent site this turn.'
registerScript('Floodplain', {
  abilities: [{
    key: 'overflow',
    label: 'Flood an adjacent site this turn',
    cost: {},
    oncePerTurn: true,
    // where:'adjacent' anchors on the site itself (game.ts abilityAnchor). The
    // in-effect adjacency check stays as belt-and-braces.
    targets: [{ what: 'site', count: 1, targeted: false, where: 'adjacent', label: 'an adjacent site' }],
    effect: (ctx) => {
      const self = ctx.state.sites[ctx.sourceId]
      const t = ctx.targets[0]
      if (!self || !t || !('site' in t)) return
      const site = ctx.state.sites[t.site]
      // adjacency honors the Magellan Globe, so a cross-border neighbour the GUI offered is accepted
      if (!site || !adjacentSquaresW(ctx.state, self.x, self.y).some((s) => s.x === site.x && s.y === site.y)) return
      ctx.floodSite(site.id, 'endOfTurn')
    },
  }],
})
