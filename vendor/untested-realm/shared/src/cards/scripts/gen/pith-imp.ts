import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { pushLog, opponent, luckyChoiceIndex } from '../../../engine/effects'

// 'Genesis → Steals a random spell from your opponent's hand until it leaves the realm.'
// The stolen card stays in the hand but is sealed while the Imp lives.
registerScript('Pith Imp', {
  genesis: (ctx) => {
    const opp = ctx.state.players[opponent(ctx.controller)]
    // "a random SPELL" — sites in hand are not spells, so they can't be filched
    const spells = opp.hand.filter((id) => getCard(ctx.state.cards[id].name).type !== 'Site')
    if (!spells.length) return
    // which spell is filched is the Imp-controller's random determination → Lucky Charm /
    // Kythera may bend it (the candidate names are revealed to the chooser only then)
    const pick = ctx.lucky(spells.map((id) => ({ label: ctx.state.cards[id].name, payload: id })), 'filch', 'cards')
    if (pick !== undefined) pithSteal(ctx, pick as string)
  },
  conts: {
    filch: (ctx, c, choice) => pithSteal(ctx, (c.__opts as string[])[luckyChoiceIndex(c, choice)]),
  },
})

function pithSteal(ctx: EffectAPI, cardId: string): void {
  if (!ctx.state.cards[cardId]) return
  ctx.state.flow = ctx.state.flow ?? {}
  ctx.state.flow.stolen = [...(ctx.state.flow.stolen ?? []), { cardId, unitId: ctx.sourceId }]
  pushLog(ctx.state, ctx.controller, `The Pith Imp filches ${ctx.state.cards[cardId].name}!`)
}
