import { registerScript } from '../registry'
import { orthAdjacentWrapped } from '../../../engine/grid'
import { isLegalStep } from '../../../engine/movement'
import { emitUnitMoved, checkStateBased } from '../../../engine/effects'

// 'Ranged / Immediately after performing a ranged strike, Kite Archer may take a step.'
registerScript('Kite Archer', {
  afterRangedStrike: (ctx, self) => {
    const from = { x: self.x, y: self.y, region: self.region }
    const squares = orthAdjacentWrapped(ctx.state, self.x, self.y).filter((s) => isLegalStep(ctx.state, self, from, { ...s, region: self.region }))
    if (!squares.length) return
    // "MAY take a step" — its own square is offered so you can stay put (the step is optional).
    ctx.ask({ kind: 'chooseSquare', title: 'Kite Archer skips away — step where? (its square to stay)', data: { squares: [...squares, { x: self.x, y: self.y }] } }, 'kite')
  },
  conts: {
    kite: (ctx, _c, sq) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || !sq || (sq.x === self.x && sq.y === self.y)) return
      if (!orthAdjacentWrapped(ctx.state, self.x, self.y).some((s) => s.x === sq.x && s.y === sq.y)) return
      // it TAKES A STEP — a real slide (fires on-enter triggers), not a teleport zap.
      const from = { x: self.x, y: self.y, region: self.region }
      self.x = sq.x
      self.y = sq.y
      emitUnitMoved(ctx.state, self, from)
      checkStateBased(ctx.state)
    },
  },
})
