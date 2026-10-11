import { registerScript } from '../registry'
import { opponent, pushLog } from '../../../engine/effects'
import { shuffleWithSeed } from '../../../engine/rng'
import { cemeteryProtected } from '../../../engine/statics'

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
      // Wormelow Tump can seal the cemetery against the crows
      const zones = cemeteryProtected(ctx.state, oppId, ctx.controller)
        ? [opp.hand, opp.spellbook]
        : [opp.hand, opp.spellbook, opp.cemetery]
      for (const zone of zones) {
        for (let i = zone.length - 1; i >= 0; i--) {
          if (ctx.state.cards[zone[i]]?.name === name) {
            opp.banished.push(zone.splice(i, 1)[0])
            taken++
          }
        }
      }
      ctx.state.seed = shuffleWithSeed(opp.spellbook, ctx.state.seed)
      pushLog(ctx.state, ctx.controller, `Feast for Crows names "${name}" — ${taken} banished; the spellbook is shuffled.`)
    },
  },
})
