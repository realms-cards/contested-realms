import { registerScript } from '../registry'
import { GRID_H, GRID_W } from '../../../engine/grid'

// 'Whenever Wayfaring Pilgrim enters each corner of the realm for the first time,
//  you may draw a card.'
registerScript('Wayfaring Pilgrim', {
  onUnitEntersSquare: (ctx, moved) => {
    if (moved.id !== ctx.sourceId) return
    const corner =
      (moved.x === 0 || moved.x === GRID_W - 1) && (moved.y === 0 || moved.y === GRID_H - 1)
        ? `corner${moved.x},${moved.y}`
        : null
    if (!corner) return
    const self = ctx.state.units[ctx.sourceId]
    if (!self || self.counters?.[corner]) return
    self.counters = { ...self.counters, [corner]: 1 }
    ctx.ask({ kind: 'yesNo', title: 'Wayfaring Pilgrim reaches a new corner — draw a card?' }, 'milestone')
  },
  conts: {
    milestone: (ctx, _c, yes) => {
      if (yes) ctx.drawCard(ctx.controller)
    },
  },
})
