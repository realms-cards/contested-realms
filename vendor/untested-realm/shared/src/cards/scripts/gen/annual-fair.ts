import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import type { Thresholds } from '../../../engine/types'
import { addTempThresh } from '../multi-card-utils/add-temp-thresh'

// '(1) → Gain (A), (E), (F), or (W) this turn.'
registerScript('Annual Fair', {
  abilities: [{
    key: 'fair',
    label: '① → Gain a threshold this turn',
    cost: { mana: 1 },
    effect: (ctx) => {
      ctx.ask({ kind: 'chooseOption', title: 'The fair grants which element?', data: { options: ['Air', 'Earth', 'Fire', 'Water'] } }, 'fair')
    },
  }],
  conts: {
    fair: (ctx, _c, choice) => {
      if (typeof choice !== 'string') return
      addTempThresh(ctx.state, ctx.controller, { [choice.toLowerCase()]: 1 } as Partial<Thresholds>)
      pushLog(ctx.state, ctx.controller, `The Annual Fair grants (${choice[0]}).`)
    },
  },
})
