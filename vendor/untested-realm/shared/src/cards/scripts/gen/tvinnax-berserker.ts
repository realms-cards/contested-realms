import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Whenever Tvinnax Berserker can attack a unit, he must. / Untap Tvinnax
//  Berserker whenever he attacks and kills an enemy minion.'
registerScript('Tvinnax Berserker', {
  mustAttackSelf: true,
  onAttackKill: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (self) {
      self.tapped = false
      pushLog(ctx.state, ctx.controller, 'Tvinnax roars for more blood!')
    }
  },
})
