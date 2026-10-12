import { registerScript } from '../registry'
import { pushLog, killUnit, checkStateBased, effectSummonUnit } from '../../../engine/effects'
import { effSubtypes } from '../../../engine/statics'

// 'Sacrifice an allied Mortal → Summon Moon Clan Werewolf from your hand to the
//  Mortal's location.'
registerScript('Moon Clan Werewolf', {
  handAbilities: (state, cardId, owner) => [{
    key: `wolf:${cardId}`,
    label: 'Sacrifice a Mortal → the Werewolf bursts out',
    cost: {},
    effect: (ctx) => {
      const mortals = Object.values(ctx.state.units)
        .filter((u) => u.controller === ctx.controller && !u.isAvatar && effSubtypes(ctx.state, u).includes('Mortal'))
        .map((u) => u.id)
      if (!mortals.length) return ctx.log('No allied Mortal to turn.')
      ctx.ask({ kind: 'chooseTargets', title: 'Which Mortal feels the moon?', data: { candidates: mortals, count: 1, upTo: false, kind: 'unit' } }, 'moonrise', { cardId })
    },
  }],
  conts: {
    moonrise: (ctx, c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const victim = typeof id === 'string' ? ctx.state.units[id] : null
      const p = ctx.state.players[ctx.controller]
      const cardId = c.cardId as string
      if (!victim || !p.hand.includes(cardId)) return
      const { x, y, region } = victim
      killUnit(ctx.state, victim.id)
      checkStateBased(ctx.state)
      p.hand.splice(p.hand.indexOf(cardId), 1)
      const unitId = `u${ctx.state.nextId++}`
      // the Werewolf enters the realm from hand → Genesis fires (FAQ 1242)
      effectSummonUnit(ctx.state, {
        // "summon Moon Clan Werewolf" = summon THIS card (cardId), so a copier revives as itself
        id: unitId, cardId, name: ctx.state.cards[cardId]?.name ?? 'Moon Clan Werewolf', owner: ctx.state.cards[cardId].owner, controller: ctx.controller,
        isAvatar: false, x, y, region, tapped: false, damage: 0,
        enteredTurn: ctx.state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
      })
      pushLog(ctx.state, ctx.controller, 'AWOOO — the Moon Clan Werewolf bursts from its human shell!')
    },
  },
})
