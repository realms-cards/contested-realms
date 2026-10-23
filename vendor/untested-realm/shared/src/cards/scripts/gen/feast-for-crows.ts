import { registerScript } from '../registry'
import { opponent, pushLog } from '../../../engine/effects'
import { cemeteryProtected, payZoneToll } from '../../../engine/statics'
import { shuffleDeck } from '../../../engine/knowledge'

// 'Name a spell. Search an opponent's hand, spellbook and cemetery for cards
// with that name, and banish them. They shuffle.'
registerScript('Feast for Crows', {
  onCast: (ctx) => {
    ctx.ask({ kind: 'nameCard', title: 'Feast for Crows: name a spell.' }, 'named')
  },
  conts: {
    named: (ctx, _c, name) => {
      if (typeof name !== 'string' || !name) return
      const oppId = opponent(ctx.controller)
      const opp = ctx.state.players[oppId]
      let taken = 0
      // Wormelow Tump can seal the cemetery against the crows; banishing from it is access, so
      // the Bureau of Occult Control tolls it (only when the name is actually there to take)
      let cemOpen = !cemeteryProtected(ctx.state, oppId, ctx.controller)
      if (cemOpen && opp.cemetery.some((id) => ctx.state.cards[id]?.name === name) && !payZoneToll(ctx.state, ctx.controller)) {
        pushLog(ctx.state, ctx.controller, 'The Bureau of Occult Control demands (2) for cemetery access.')
        cemOpen = false
      }
      const zones = cemOpen ? [opp.hand, opp.spellbook, opp.cemetery] : [opp.hand, opp.spellbook]
      for (const zone of zones) {
        for (let i = zone.length - 1; i >= 0; i--) {
          if (ctx.state.cards[zone[i]]?.name === name) {
            opp.banished.push(zone.splice(i, 1)[0])
            taken++
          }
        }
      }
      shuffleDeck(ctx.state, opp.id, 'spellbook')
      pushLog(ctx.state, ctx.controller, `Feast for Crows names "${name}" — ${taken} banished; the spellbook is shuffled.`)
    },
  },
})
