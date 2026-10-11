import { registerScript, type EffectAPI } from '../registry'
import { pushLog, killUnit, checkStateBased, emitUnitMoved } from '../../../engine/effects'
import { orthAdjacentWrapped, siteAt, unitsAt } from '../../../engine/grid'
import { isLegalStep } from '../../../engine/movement'

// 'At the start of your turn, Purge Juggernaut taps and moves to an adjacent
//  location. Kill all other minions there.' (controller picks the destination)
registerScript('Purge Juggernaut', {
  startOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    // "moves to an adjacent location" is a STEP — only legal ones (walls / entry-bans / Immobile block it).
    const squares = orthAdjacentWrapped(ctx.state, self.x, self.y).filter(
      (s) => siteAt(ctx.state, s.x, s.y) && isLegalStep(ctx.state, self, { x: self.x, y: self.y, region: self.region }, { x: s.x, y: s.y, region: self.region }),
    )
    if (!squares.length) return purgeKill(ctx, self.x, self.y) // can't grind forward — purges in place
    ctx.ask({ kind: 'chooseSquare', title: 'The Purge Juggernaut grinds forward — to where?', data: { squares } }, 'purge')
  },
  conts: {
    purge: (ctx, _c, sq) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || !sq) return
      const from = { x: self.x, y: self.y, region: self.region }
      const to = { x: sq.x, y: sq.y, region: self.region }
      self.tapped = true
      if (isLegalStep(ctx.state, self, from, to)) { self.x = sq.x; self.y = sq.y; emitUnitMoved(ctx.state, self, from) }
      if (ctx.state.units[self.id]) purgeKill(ctx, self.x, self.y)
    },
  },
})

// Taps the Juggernaut and kills every other (non-avatar) minion at (x,y).
function purgeKill(ctx: EffectAPI, x: number, y: number): void {
  const self = ctx.state.units[ctx.sourceId]
  if (self) self.tapped = true
  for (const u of unitsAt(ctx.state, x, y, self?.region ?? 'surface')) {
    if (!u.isAvatar && u.id !== ctx.sourceId) killUnit(ctx.state, u.id)
  }
  checkStateBased(ctx.state)
  pushLog(ctx.state, ctx.controller, 'The Juggernaut purges all in its path.')
}
