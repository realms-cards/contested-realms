import { registerScript } from '../registry'
import { luckyChoiceIndex, effectSummonUnit } from '../../../engine/effects'
import { getCard } from '../../db'
import { raiseAsk } from './magic-helpers'

// 'Summon a random dead minion.'
registerScript('Raise Dead', {
  onCast: (ctx) => {
    const dead: string[] = []
    for (const p of ctx.state.players) {
      for (const id of p.cemetery) {
        if (getCard(ctx.state.cards[id].name).type === 'Minion') dead.push(id)
      }
    }
    if (!dead.length) return ctx.log('No dead minions to raise.')
    // which dead minion is chosen is random → Lucky Charm / Kythera may bend it
    const pick = ctx.lucky(dead.map((id) => ({ label: ctx.state.cards[id].name, payload: id })), 'raisePick', 'cards')
    if (pick !== undefined) raiseAsk(ctx, pick as string)
  },
  conts: {
    raisePick: (ctx, c, choice) => raiseAsk(ctx, (c.__opts as string[])[luckyChoiceIndex(c, choice)]),
    rise: (ctx, contCtx, choice) => {
      const { x, y } = choice ?? {}
      if (x === undefined) return
      const pick = contCtx.pick
      const card = ctx.state.cards[pick]
      if (!card) return
      const owner = card.owner
      ctx.state.players[owner].cemetery = ctx.state.players[owner].cemetery.filter((i: string) => i !== pick)
      const unitId = `u${ctx.state.nextId++}`
      // reanimated into the realm → Genesis fires (FAQ 1242: effect-summons resolve
      // the summoned minion's genesis effects). Proven red→green: reverting this to
      // direct placement makes the Static Servant genesis test fail (0 damage).
      effectSummonUnit(ctx.state, {
        id: unitId, cardId: pick, name: card.name, owner, controller: ctx.controller,
        isAvatar: false, x, y, region: 'surface', tapped: false, damage: 0,
        enteredTurn: ctx.state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
      })
      ctx.log(`${card.name} rises from the cemetery.`)
    },
  },
})
