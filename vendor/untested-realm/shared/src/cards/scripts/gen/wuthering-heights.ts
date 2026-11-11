import { registerScript } from '../registry'
import { nearbySquaresW, siteAt, unitsAt } from '../../../engine/grid'
import { siteEntryAllowed } from '../../../engine/movement'
import { moveProtected } from '../../../engine/effects'
import { protectedFromSites } from '../../../engine/statics'

// 'Once on your turn, you may fly a minion atop here onto a nearby site.'
registerScript('Wuthering Heights', {
  abilities: [{
    key: 'gust',
    label: 'Fly a minion here to a nearby site',
    cost: {},
    oncePerTurn: true,
    effect: (ctx) => {
      const self = ctx.state.sites[ctx.sourceId]
      if (!self) return
      // the flight is this site's ability moving the minion by force: a unit that ignores site abilities (Key
      // to the City) or can't be moved by force (Talamh Dreig) isn't a choice
      const riders = unitsAt(ctx.state, self.x, self.y, 'surface')
        .filter((u) => !u.isAvatar && !protectedFromSites(ctx.state, u) && !moveProtected(ctx.state, u, ctx.controller))
        .map((u) => u.id)
      if (!riders.length) return ctx.log('No one stands on the heights.')
      // "a minion", not "target minion": choosing isn't targeting, so a Ward doesn't break (notTargeted)
      ctx.ask({ kind: 'chooseTargets', title: 'The wind lifts whom?', data: { candidates: riders, count: 1, upTo: false, kind: 'unit', notTargeted: true } }, 'lift')
    },
  }],
  conts: {
    lift: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const self = ctx.state.sites[ctx.sourceId]
      const u = typeof id === 'string' ? ctx.state.units[id] : null
      if (!self || !u) return
      // being flown is forced movement: a location it can't enter that way (a Crucifix vs Evil) isn't offered
      const squares = nearbySquaresW(ctx.state, self.x, self.y).filter((s) => siteAt(ctx.state, s.x, s.y) && !(s.x === self.x && s.y === self.y) &&
        siteEntryAllowed(ctx.state, u, { x: u.x, y: u.y, region: u.region }, { x: s.x, y: s.y, region: 'surface' }, true))
      if (!squares.length) return
      ctx.ask({ kind: 'chooseSquare', title: `${u.name} is blown where?`, data: { squares } }, 'land', { unitId: u.id })
    },
    land: (ctx, c, sq) => {
      const u = ctx.state.units[c.unitId as string]
      if (u && sq) ctx.teleport(u.id, sq.x, sq.y, 'surface')
    },
  },
})
