import { registerScript } from '../registry'
import { orthAdjacentWrapped, unitsAt } from '../../../engine/grid'

// 'At the end of your turn, Quarrelsome Kobolds strike themselves or another
//  target adjacent unit.'
registerScript('Quarrelsome Kobolds', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const mine = self.controller
    const targets = [...new Set(
      [
        ...unitsAt(ctx.state, self.x, self.y, self.region),          // own square (includes self + any co-located units)
        ...orthAdjacentWrapped(ctx.state, self.x, self.y).flatMap((s) => unitsAt(ctx.state, s.x, s.y, self.region)), // orthogonally-adjacent squares
      ]
        // "another target adjacent unit" — this is a TARGETED strike, so a Stealthed enemy can't be chosen
        // (Stealth only hides from opponents: the Kobolds' own Stealthed minions, and the Kobolds itself, stay valid).
        .filter((u) => !(u.stealth && u.controller !== mine))
        .map((u) => u.id),
    )]
    ctx.ask({ kind: 'chooseTargets', title: 'The Kobolds squabble — who takes the blow?', data: { candidates: targets, count: 1, upTo: false, kind: 'unit' } }, 'brawl')
  },
  conts: {
    brawl: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const self = ctx.state.units[ctx.sourceId]
      if (!self || typeof id !== 'string' || !ctx.state.units[id]) return
      ctx.strike(self, { unit: id })
    },
  },
})
