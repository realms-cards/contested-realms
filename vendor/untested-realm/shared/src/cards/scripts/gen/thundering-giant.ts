import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'
import { regionPresentAt } from '../../../engine/statics'

// 'Once on your turn, Thundering Giant may teleport to another nearby location.
//  Tap all other units there on arrival.'
// A nearby location is in the Giant's own region (Codex, Nearby; Teleport: "does not cross borders"), and
// "there" is that one location: units above or below it aren't tapped, nor anyone if the Giant never arrives.
registerScript('Thundering Giant', {
  abilities: [{
    key: 'thunder',
    label: 'Thunder-leap to a nearby location',
    cost: {},
    oncePerTurn: true,
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const squares = nearbySquaresW(ctx.state, self.x, self.y)
        .filter((s) => regionPresentAt(ctx.state, self.region, s.x, s.y) && !(s.x === self.x && s.y === self.y))
      if (!squares.length) return
      ctx.ask({ kind: 'chooseSquare', title: 'The Giant leaps where?', data: { squares } }, 'leap')
    },
  }],
  conts: {
    leap: (ctx, _c, sq) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || !sq) return
      const region = self.region
      if (!ctx.teleport(self.id, sq.x, sq.y, region)) return
      if (!ctx.state.units[self.id]) return
      for (const u of unitsAt(ctx.state, sq.x, sq.y, region)) {
        if (u.id !== self.id) u.tapped = true
      }
      pushLog(ctx.state, ctx.controller, 'THOOM. The very ground staggers everyone nearby.')
    },
  },
})
