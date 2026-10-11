import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { effKeywords } from '../../../engine/statics'
import { orthAdjacentWrapped } from '../../../engine/grid'

// 'Disabled until an adjacent Spellcaster taps to release him.'
registerScript('Shackled Demon', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (self) self.disabled = true
  },
  grantsAbilities: (state, selfId, unit) => {
    const self = state.units[selfId]
    if (!self || !self.disabled || unit.id === selfId) return []
    if (!effKeywords(state, unit).spellcaster && !unit.isAvatar) return []
    if (!orthAdjacentWrapped(state, self.x, self.y).some((s) => s.x === unit.x && s.y === unit.y)) return []
    return [{
      key: 'shackles:release',
      label: 'Tap → Release the Shackled Demon',
      cost: { tap: true },
      effect: (ctx2) => {
        // release THIS demon (closed over selfId), not whichever copy `find` returns first
        const demon = ctx2.state.units[selfId]
        if (demon && demon.disabled) {
          demon.disabled = undefined
          pushLog(ctx2.state, ctx2.controller, 'The shackles fall — the Demon is loosed!')
        }
      },
    }]
  },
})
