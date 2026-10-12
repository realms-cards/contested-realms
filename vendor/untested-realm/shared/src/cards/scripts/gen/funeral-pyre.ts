import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import type { PlayerId } from '../../../engine/types'
import { askBanishFromCemetery, resolveBanishFromCemetery } from './cemetery-choose'

// 'Genesis → Banish up to three cards from one cemetery.'
registerScript('Funeral Pyre', {
  genesis: (ctx) => {
    ctx.ask({ kind: 'chooseOption', title: 'Burn which cemetery?', data: { options: ['yours', "opponent's", '(none)'] } }, 'pyre')
  },
  conts: {
    pyre: (ctx, _c, choice) => {
      if (!choice || choice === '(none)') return
      const pid = (choice === 'yours' ? ctx.controller : 1 - ctx.controller) as PlayerId
      // "up to three" — the player chooses which (and how many) to burn
      if (!askBanishFromCemetery(ctx, pid, 3, true, 'burned')) pushLog(ctx.state, ctx.controller, 'That cemetery is empty.')
    },
    burned: (ctx, c, choice) => {
      const banished = resolveBanishFromCemetery(ctx, c, choice)
      pushLog(ctx.state, ctx.controller, `The pyre consumes ${banished.length} card(s) from ${ctx.state.players[c.pid as PlayerId].name}'s cemetery.`)
    },
  },
})
