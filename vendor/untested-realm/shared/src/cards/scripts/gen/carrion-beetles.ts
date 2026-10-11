import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import type { PlayerId } from '../../../engine/types'
import { askBanishFromCemetery, resolveBanishFromCemetery } from './cemetery-choose'

// 'Burrowing / Genesis → Banish three cards from one cemetery.'
registerScript('Carrion Beetles', {
  genesis: (ctx) => {
    ctx.ask({ kind: 'chooseOption', title: 'Devour which cemetery?', data: { options: ['yours', "opponent's"] } }, 'gnaw')
  },
  conts: {
    gnaw: (ctx, _c, choice) => {
      const pid = (choice === 'yours' ? ctx.controller : 1 - ctx.controller) as PlayerId
      // the player chooses WHICH three cards to banish (not the oldest three)
      if (!askBanishFromCemetery(ctx, pid, 3, false, 'devour')) pushLog(ctx.state, ctx.controller, 'That cemetery is empty.')
    },
    devour: (ctx, c, choice) => {
      const banished = resolveBanishFromCemetery(ctx, c, choice)
      pushLog(ctx.state, ctx.controller, `The beetles devour ${banished.length} card(s) from ${ctx.state.players[c.pid as PlayerId].name}'s cemetery.`)
    },
  },
})
