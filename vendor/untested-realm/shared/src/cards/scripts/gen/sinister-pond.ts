import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { effSubtypes, isUnmodifiable } from '../../../engine/statics'

// 'Mortals here may transform into Evil from hand by paying the difference in cost.'
registerScript('Sinister Pond', {
  siteGrantsAbilities: (state, site, unit) => {
    if (unit.isAvatar || unit.x !== site.x || unit.y !== site.y) return []
    if (!effSubtypes(state, unit).includes('Mortal')) return []
    const p = state.players[unit.controller]
    const evils = p.hand.filter((id) => {
      const def = getCard(state.cards[id].name)
      const st = def.subtypes
      return def.type === 'Minion' && (st.includes('Demon') || st.includes('Undead') || st.includes('Monster'))
    })
    if (!evils.length) return []
    return [{
      key: 'pond:baptism',
      label: 'Wade in: transform into an Evil from hand',
      cost: {},
      effect: (ctx) => {
        const self = ctx.state.units[ctx.sourceId]
        if (!self) return
        const pl = ctx.state.players[ctx.controller]
        const options = pl.hand.filter((id) => {
          const def = getCard(ctx.state.cards[id].name)
          const st = def.subtypes
          return def.type === 'Minion' && (st.includes('Demon') || st.includes('Undead') || st.includes('Monster'))
        })
        ctx.ask(
          { kind: 'chooseCards', title: 'The dark water offers which shape?', data: { cards: options.map((id) => ctx.state.cards[id].name), pick: 1, upTo: false } },
          'baptism',
          { options, mortalId: ctx.sourceId },
        )
      },
    }]
  },
  conts: {
    baptism: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      if (typeof idx !== 'number') return
      const cardId = (c.options as string[])[idx]
      const mortal = ctx.state.units[c.mortalId as string]
      const p = ctx.state.players[ctx.controller]
      if (!mortal || !p.hand.includes(cardId)) return
      if (isUnmodifiable(ctx.state, mortal)) return ctx.log("That minion can't be modified.")
      const newName = ctx.state.cards[cardId].name
      const diff = Math.max(0, (getCard(newName).cost ?? 0) - (getCard(mortal.name).cost ?? 0))
      if (p.mana < diff) return pushLog(ctx.state, ctx.controller, `Not enough mana (${p.mana}/${diff}).`)
      ctx.spendMana(ctx.controller, diff)
      p.hand.splice(p.hand.indexOf(cardId), 1)
      mortal.name = newName
      mortal.cardId = cardId
      mortal.damage = 0
      pushLog(ctx.state, ctx.controller, `The pond's waters close — and something else climbs out: ${newName}.`)
    },
  },
})
