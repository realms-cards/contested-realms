import { registerScript } from '../registry'
import type { PlayerId } from '../../../engine/types'
import { askBanishFromCemetery, resolveBanishFromCemetery } from './cemetery-choose'

// 'Once on your turn, you may banish a card from a cemetery to summon a Skeleton token here.'
registerScript('Pile of Skulls', {
  abilities: [{
    key: 'skulls',
    label: 'Banish a dead card → Skeleton here',
    cost: {},
    effect: (ctx) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      if (!art) return
      art.counters = art.counters ?? {}
      if (art.counters.usedTurn === ctx.state.turn) return ctx.log('Already used this turn.')
      ctx.ask({ kind: 'chooseOption', title: 'Banish from which cemetery?', data: { options: ['yours', "opponent's"] } }, 'stack')
    },
  }],
  conts: {
    stack: (ctx, _c, choice) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      if (!art) return
      const pid = (choice === 'yours' ? ctx.controller : 1 - ctx.controller) as PlayerId
      // the player chooses WHICH card to banish (not the oldest); nothing to banish → no summon
      if (!askBanishFromCemetery(ctx, pid, 1, false, 'raise')) return ctx.log('That cemetery is empty.')
    },
    raise: (ctx, c, choice) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      if (!art) return
      const banished = resolveBanishFromCemetery(ctx, c, choice)
      if (!banished.length) return // nothing chosen → the ability does nothing (not consumed)
      art.counters = { ...art.counters, usedTurn: ctx.state.turn }
      // "here" = the Pile's own location (a buried/submerged Monument summons into its own region; a
      // non-Burrowing/Submerge Skeleton then can't survive there and dies via state-based rules)
      ctx.summonToken('Skeleton', ctx.controller, art.x, art.y, art.region)
    },
  },
})
