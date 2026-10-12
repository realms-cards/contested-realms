import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { nearbySquaresW, siteAt, unitsAt } from '../../../engine/grid'
import { effAttack } from '../../../engine/statics'

// 'Once on your turn, Siege Giant may throw a weaker ally here through the air
//  to a nearby location.'
registerScript('Siege Giant', {
  abilities: [{
    key: 'hurl',
    label: 'Hurl a weaker ally to a nearby location',
    cost: {},
    oncePerTurn: true,
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      // a "weaker ally" is any allied UNIT here (minion OR avatar — not only minions), never itself
      const loadable = unitsAt(ctx.state, self.x, self.y, self.region)
        .filter((u) => u.id !== self.id && u.controller === ctx.controller && effAttack(ctx.state, u) < effAttack(ctx.state, self))
        .map((u) => u.id)
      if (!loadable.length) return ctx.log('No weaker ally here to throw.')
      ctx.ask({ kind: 'chooseTargets', title: 'Hurl whom?', data: { candidates: loadable, count: 1, upTo: false, kind: 'unit' } }, 'windup')
    },
  }],
  conts: {
    windup: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const self = ctx.state.units[ctx.sourceId]
      if (!self || typeof id !== 'string' || !ctx.state.units[id]) return
      const squares = nearbySquaresW(ctx.state, self.x, self.y).filter((s) => siteAt(ctx.state, s.x, s.y) && !(s.x === self.x && s.y === self.y))
      if (!squares.length) return
      ctx.ask({ kind: 'chooseSquare', title: 'They land where?', data: { squares } }, 'fling', { unitId: id })
    },
    fling: (ctx, c, sq) => {
      const u = ctx.state.units[c.unitId as string]
      if (u && sq) {
        ctx.teleport(u.id, sq.x, sq.y, 'surface')
        pushLog(ctx.state, ctx.controller, `${u.name} sails through the air!`)
      }
    },
  },
})
