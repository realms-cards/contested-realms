import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog, effectSummonUnit } from '../../../engine/effects'
import { strikeSite } from '../../../engine/combat'
import { payZoneToll } from '../../../engine/statics'

// 'Lance / If Dame Britomart would successfully attack an enemy site, she may
//  summon a Mortal from your cemetery to her location instead.'
registerScript('Dame Britomart', {
  siteStrikeChoice: (ctx, siteId) => {
    const p = ctx.state.players[ctx.controller]
    const mortals = p.cemetery.filter((id) => {
      const def = getCard(ctx.state.cards[id].name)
      return def.type === 'Minion' && def.subtypes.includes('Mortal')
    })
    if (!mortals.length) return false // nothing to summon: strike normally
    ctx.ask(
      { kind: 'chooseCards', title: 'Britomart rallies which fallen Mortal instead of striking? (skip to strike)', data: { cards: mortals.map((id) => ctx.state.cards[id].name), pick: 1, upTo: true } },
      'rally',
      { siteId, mortals },
    )
    return true
  },
  conts: {
    rally: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      const self = ctx.state.units[ctx.sourceId]
      if (typeof idx !== 'number' || !self) {
        // declined: the strike lands after all
        strikeSite(ctx.state, ctx.sourceId, c.siteId as string)
        return
      }
      const cardId = (c.mortals as string[])[idx]
      const p = ctx.state.players[ctx.controller]
      if (!p.cemetery.includes(cardId)) return
      if (!payZoneToll(ctx.state, ctx.controller)) {
        pushLog(ctx.state, ctx.controller, 'The Bureau of Occult Control demands (2) for cemetery access — the strike lands instead.')
        strikeSite(ctx.state, ctx.sourceId, c.siteId as string)
        return
      }
      p.cemetery.splice(p.cemetery.indexOf(cardId), 1)
      const name = ctx.state.cards[cardId].name
      const unitId = `u${ctx.state.nextId++}`
      // reanimated into the realm → Genesis fires (FAQ 1242)
      effectSummonUnit(ctx.state, {
        id: unitId, cardId, name, owner: ctx.state.cards[cardId].owner, controller: ctx.controller,
        isAvatar: false, x: self.x, y: self.y, region: self.region, tapped: false, damage: 0,
        enteredTurn: ctx.state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
      })
      pushLog(ctx.state, ctx.controller, `Britomart spares the walls — and ${name} answers her call.`)
    },
  },
})
