import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { pushLog, opponent, luckyChoiceIndex } from '../../../engine/effects'

// 'Genesis → Steals a random spell from your opponent's hand until it leaves the realm.'
// The filched card leaves the opponent's hand and is held by the Imp: ONLY the Imp may cast it,
// and only while it is a Spellcaster (it has none by default — a grant must confer it). When the
// Imp leaves the realm the unspent card returns to its owner (see removeUnitFromRealm).
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
  const card = ctx.state.cards[cardId]
  const imp = ctx.state.units[ctx.sourceId]
  if (!card || !imp) return
  const opp = ctx.state.players[opponent(ctx.controller)]
  const i = opp.hand.indexOf(cardId)
  if (i < 0) return
  // physically take it from the opponent's hand into the thief's — the Imp now holds it
  opp.hand.splice(i, 1)
  ctx.state.players[ctx.controller].hand.push(cardId)
  ctx.state.flow = ctx.state.flow ?? {}
  // track it so it RETURNS to its owner when the Imp leaves the realm
  ctx.state.flow.stolen = [...(ctx.state.flow.stolen ?? []), { cardId, unitId: ctx.sourceId }]
  // INNATE caster-lock to the Imp: only the Imp may cast the filched spell, and (grantsCasting:false)
  // only while the Imp's OWN Spellcaster ability is active — a plain Pith Imp can hold it but not cast it.
  ctx.state.flow.lockedCards = [...(ctx.state.flow.lockedCards ?? []), { cardId, casterId: ctx.sourceId, casterName: imp.name, grantsCasting: false }]
  pushLog(ctx.state, ctx.controller, `The Pith Imp filches ${card.name}!`)
}
