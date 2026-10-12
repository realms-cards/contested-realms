import { registerScript } from '../registry'
import { getCard } from '../../db'
import { unitsAt } from '../../../engine/grid'
import { luckyChoiceIndex, toCemetery } from '../../../engine/effects'

// 'Airborne / Discard a spell → Deal 3 damage to another random unit here.'
registerScript('Nimbus Jinn', {
  abilities: [{
    key: 'stormBlast',
    label: 'Discard a spell → Deal 3 damage to another random unit here',
    cost: {},
    effect: (ctx) => {
      const p = ctx.state.players[ctx.controller]
      const spells = p.hand.filter((id) => getCard(ctx.state.cards[id].name).type !== 'Site')
      if (spells.length === 0) return ctx.log('No spells in hand to discard.')
      const options = spells.map((id, i) => `${i + 1}. ${ctx.state.cards[id].name}`)
      ctx.ask({ kind: 'chooseOption', title: 'Discard which spell?', data: { options } }, 'discard', { spellIds: spells })
    },
  }],
  conts: {
    discard: (ctx, contCtx, choice) => {
      const spellIds: string[] = contCtx.spellIds ?? []
      const idx = parseInt(String(choice), 10) - 1
      const cardId = spellIds[idx]
      const p = ctx.state.players[ctx.controller]
      if (cardId === undefined || !p.hand.includes(cardId)) return
      p.hand = p.hand.filter((id) => id !== cardId)
      toCemetery(ctx.state, cardId)
      ctx.log(`${p.name} discards ${ctx.state.cards[cardId].name}.`)
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const others = unitsAt(ctx.state, self.x, self.y, self.region).filter((u) => u.id !== self.id)
      // random target → Kythera/Black Cat (choose any) or Lucky Charm (roll N+1, choose)
      const pick = ctx.lucky(others.map((u) => ({ label: u.name, payload: u.id })), 'jinnZap', 'cards')
      if (pick !== undefined && ctx.state.units[pick as string]) ctx.dealDamage({ unit: pick as string }, 3)
    },
    jinnZap: (ctx, c, choice) => {
      const id = (c.__opts as string[])[luckyChoiceIndex(c, choice)]
      if (typeof id === 'string' && ctx.state.units[id]) ctx.dealDamage({ unit: id }, 3)
    },
  },
})
