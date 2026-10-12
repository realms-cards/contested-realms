import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { lend } from '../multi-card-utils/lend'

// 'Any time during your turn, Merlin may look at your next spell and may cast
//  it if it's a magic spell.'
registerScript('Merlin', {
  abilities: [{
    key: 'foresee',
    label: 'Look at your next spell (cast it if magic)',
    cost: {},
    usableFromCemetery: true, // only peeks/casts from your own spellbook; no activator position → usable from the grave
    effect: (ctx) => {
      const p = ctx.state.players[ctx.controller]
      const top = p.spellbook[0]
      if (top === undefined) return ctx.log('The spellbook is empty.')
      const name = ctx.state.cards[top].name
      if (getCard(name).type !== 'Magic') {
        ctx.ask({ kind: 'chooseOption', title: `Next spell: ${name} (not a magic — it stays).`, data: { options: ['ok'] } }, 'noop')
        return
      }
      ctx.ask({ kind: 'chooseOption', title: `Next spell: ${name}. Take it up to cast this turn?`, data: { options: ['take it', 'leave it'] } }, 'foresee', { top })
    },
  }],
  conts: {
    noop: () => {},
    foresee: (ctx, c, choice) => {
      if (choice !== 'take it') return
      const p = ctx.state.players[ctx.controller]
      if (p.spellbook[0] !== c.top) return
      p.spellbook.shift()
      lend(ctx, c.top as string, 'spellbookTop', ctx.controller)
      pushLog(ctx.state, ctx.controller, 'Merlin plucks the future from the page.')
    },
  },
})
