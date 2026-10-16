import { registerScript, type EffectAPI } from '../registry'
import { pushLog, killUnit, checkStateBased, effectSummonUnit } from '../../../engine/effects'
import { effSubtypes } from '../../../engine/statics'

// 'Sacrifice an allied Mortal → Summon Moon Clan Werewolf from your hand to the Mortal's location.'
// While the Werewolf is in your hand it grants EACH of your Mortals a "sacrifice me → the Werewolf
// bursts out here" ability — surfaced ON the Mortal (click it), exactly like a Skeleton token raising a
// bone-raiser from the cemetery. Not an avatar ability. (The card is still a normal 3-cost summon too.)
registerScript('Moon Clan Werewolf', {
  handAbilitiesForAlly: (state, cardId, _owner, ally) => {
    if (ally.isAvatar || !effSubtypes(state, ally).includes('Mortal')) return []
    return [{
      key: `wolf:${cardId}`,
      label: 'Sacrifice → the Moon Clan Werewolf bursts out here',
      cost: {},
      contOwner: 'Moon Clan Werewolf',
      effect: (ctx) => summonWerewolfFromMortal(ctx, cardId),
    }]
  },
})

function summonWerewolfFromMortal(ctx: EffectAPI, cardId: string): void {
  const victim = ctx.state.units[ctx.sourceId] // the Mortal whose ability this is
  const p = ctx.state.players[ctx.controller]
  if (!victim || !p.hand.includes(cardId)) return
  const { x, y, region } = victim
  // Sacrifice the Mortal FIRST (a sacrifice bypasses "can't be destroyed") and settle it, THEN summon —
  // so the Werewolf's entry doesn't fire site triggers (Sold-out Cemetery) while the sacrificed Mortal is
  // still a live unit on the square (the Skeleton bone-raise does the same, for the same soft-lock reason).
  ctx.state.flow = ctx.state.flow ?? {}
  const prev = ctx.state.flow.sacrificing
  ctx.state.flow.sacrificing = victim.id
  killUnit(ctx.state, victim.id)
  ctx.state.flow.sacrificing = prev
  checkStateBased(ctx.state)
  p.hand.splice(p.hand.indexOf(cardId), 1)
  // the Werewolf enters the realm from hand → Genesis fires (FAQ 1242); "summon THIS card" so a copier
  // revives as itself.
  effectSummonUnit(ctx.state, {
    id: `u${ctx.state.nextId++}`, cardId, name: ctx.state.cards[cardId]?.name ?? 'Moon Clan Werewolf',
    owner: ctx.state.cards[cardId].owner, controller: ctx.controller,
    isAvatar: false, x, y, region, tapped: false, damage: 0,
    enteredTurn: ctx.state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
  })
  pushLog(ctx.state, ctx.controller, 'AWOOO — the Moon Clan Werewolf bursts from its human shell!')
}
