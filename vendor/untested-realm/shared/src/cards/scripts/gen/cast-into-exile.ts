import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'
import { pushLog, removeUnitFromRealm, returnToDeck } from '../../../engine/effects'
import { shuffleWithSeed } from '../../../engine/rng'

// "Shuffle target minion occupying an allied site into its owner's spellbook."
registerScript('Cast into Exile', {
  targets: [{
    what: 'minion', count: 1, targeted: true, label: 'target minion on your site',
    filter: (state, u, caster) => {
      const site = siteAt(state, u.x, u.y)
      return !!site && site.controller === caster.controller
    },
  }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    const card = ctx.state.cards[u.cardId]
    if (removeUnitFromRealm(ctx.state, u.id)) delete ctx.state.units[u.id] // cargo stays (FAQ); avatars refuse removal
    if (card && !card.isToken) {
      const owner = returnToDeck(ctx.state, card.id) // its OWNER's deck, regardless of who controlled it
      ctx.state.seed = shuffleWithSeed(ctx.state.players[owner].spellbook, ctx.state.seed)
    }
    pushLog(ctx.state, ctx.controller, `${u.name} is cast into exile.`)
  },
})
