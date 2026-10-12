import { registerScript, type EffectAPI } from '../registry'
import { pushLog } from '../../../engine/effects'
import { GRID_W, GRID_H } from '../../../engine/grid'
import { isVoidAt } from '../../../engine/statics'

// ------------------------------------------------------------ Yog-Sothoth ----
// 'Occupies all locations safely. / Is banished without five voids. /
//  Ignores the abilities of sites.'
function yogCheck(ctx: EffectAPI): void {
  const self = ctx.state.units[ctx.sourceId]
  if (!self) return
  let voids = 0
  for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) if (isVoidAt(ctx.state, x, y)) voids++
  if (voids < 5) {
    pushLog(ctx.state, self.controller, `The realm holds only ${voids} voids — Yog-Sothoth is banished!`)
    ctx.banish(self.id)
  }
}

registerScript('Yog-Sothoth', {
  ignoresSites: true,
  // 'safely': no terrain can harm what exists everywhere and nowhere. It already
  // occupies EVERY location, so it never moves (nowhere to go) — but it can strike
  // anything anywhere (occupiedSquares covers the whole realm).
  selfKeywords: () => ['voidwalk', 'submerge', 'burrowing', 'immobile'],
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    self.extraSquares = []
    for (let x = 0; x < GRID_W; x++) {
      for (let y = 0; y < GRID_H; y++) {
        if (x !== self.x || y !== self.y) self.extraSquares.push({ x, y })
      }
    }
    pushLog(ctx.state, ctx.controller, '👁 Yog-Sothoth IS the gate. It occupies all locations.')
    yogCheck(ctx)
  },
  startOfEachTurn: (ctx) => yogCheck(ctx),
  onSitePlayed: (ctx) => yogCheck(ctx),
})
