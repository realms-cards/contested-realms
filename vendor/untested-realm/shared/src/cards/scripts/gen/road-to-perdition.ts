import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'
import { isEvilU } from '../multi-card-utils/is-evil-u'

// 'Genesis → Target nearby Evil gains or loses 1 power this turn.'
registerScript('Road to Perdition', {
  genesis: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    const evils = Object.values(ctx.state.units)
      .filter((u) => !u.isAvatar && isEvilU(ctx.state, u) && nearbySquaresW(ctx.state, self.x, self.y).some((s) => s.x === u.x && s.y === u.y))
      .map((u) => u.id)
    if (!evils.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'The road tempts which nearby Evil?', data: { candidates: evils, count: 1, upTo: true, kind: 'unit' } }, 'tempt')
  },
  conts: {
    tempt: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (typeof id !== 'string' || !ctx.state.units[id]) return
      ctx.ask({ kind: 'chooseOption', title: 'Gains or loses 1 power this turn?', data: { options: ['+1 power', '-1 power'] } }, 'sway', { id })
    },
    sway: (ctx, c, choice) => {
      const u = ctx.state.units[c.id as string]
      if (u && typeof choice === 'string') ctx.addPower(u.id, choice.startsWith('+') ? 1 : -1, 'endOfTurn')
    },
  },
})
