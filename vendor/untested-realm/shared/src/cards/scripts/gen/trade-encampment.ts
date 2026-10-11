import { registerScript } from '../registry'
import { getCard, allCards } from '../../db'
import { pushLog } from '../../../engine/effects'
import { collectionBanned, payZoneToll } from '../../../engine/statics'

// -------------------------------------------------------- Trade Encampment ----
// 'Genesis → You may trade an artifact in your hand with one of equal rarity
//  from your collection'
registerScript('Trade Encampment', {
  genesis: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    const arts = p.hand.filter((id) => getCard(ctx.state.cards[id].name).type === 'Artifact')
    if (!arts.length) return
    ctx.ask(
      { kind: 'chooseCards', title: 'Trade which artifact from your hand? (skip for none)', data: { cards: arts.map((id) => ctx.state.cards[id].name), pick: 1, upTo: true } },
      'offer',
      { arts },
    )
  },
  conts: {
    offer: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      if (typeof idx !== 'number') return
      const cardId = (c.arts as string[])[idx]
      if (!cardId) return
      if (!payZoneToll(ctx.state, ctx.controller)) {
        return pushLog(ctx.state, ctx.controller, 'The Bureau of Occult Control demands (2) for collection access.')
      }
      const rarity = getCard(ctx.state.cards[cardId].name).rarity
      const wares = allCards
        .filter((cd) => cd.type === 'Artifact' && cd.rarity === rarity && cd.name !== ctx.state.cards[cardId].name && !collectionBanned(ctx.state, ctx.controller, cd.name))
        .map((cd) => cd.name)
      if (!wares.length) return ctx.log('The traders have nothing of equal rarity.')
      ctx.ask({ kind: 'chooseCards', title: `Trade for which ${rarity} artifact?`, data: { cards: wares, pick: 1, upTo: false } }, 'barter', { cardId, wares })
    },
    barter: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      if (typeof idx !== 'number') return
      const want = (c.wares as string[])[idx]
      const p = ctx.state.players[ctx.controller]
      const giveId = c.cardId as string
      if (!want || !p.hand.includes(giveId)) return
      p.hand.splice(p.hand.indexOf(giveId), 1) // back into the collection
      const newId_ = `c${ctx.state.nextId++}`
      ctx.state.cards[newId_] = { id: newId_, name: want, owner: ctx.controller }
      p.hand.push(newId_)
      pushLog(ctx.state, ctx.controller, `${ctx.state.cards[giveId].name} traded for ${want}.`)
    },
  },
})
