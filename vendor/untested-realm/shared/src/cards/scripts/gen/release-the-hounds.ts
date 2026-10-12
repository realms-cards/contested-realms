import { registerScript, type EffectAPI } from '../registry'
import { pushLog, effectSummonUnit } from '../../../engine/effects'
import { collectionBanned, payZoneToll } from '../../../engine/statics'

/** collection-cast: a fresh real copy enters the realm (the Legion of Gall may
 *  have banished it; the Bureau of Occult Control tolls the access) */
function summonFromCollection(ctx: EffectAPI, name: string, x: number, y: number): void {
  if (collectionBanned(ctx.state, ctx.controller, name)) {
    return pushLog(ctx.state, ctx.controller, `Every ${name} in the collection was banished by the Legion of Gall.`)
  }
  if (!payZoneToll(ctx.state, ctx.controller)) {
    return pushLog(ctx.state, ctx.controller, 'The Bureau of Occult Control demands (2) for collection access.')
  }
  const cardId = `c${ctx.state.nextId++}`
  ctx.state.cards[cardId] = { id: cardId, name, owner: ctx.controller }
  const unitId = `u${ctx.state.nextId++}`
  // a real copy enters the realm from the collection → Genesis fires (FAQ 1242)
  effectSummonUnit(ctx.state, {
    id: unitId, cardId, name, owner: ctx.controller, controller: ctx.controller,
    isAvatar: false, x, y, region: 'surface', tapped: false, damage: 0,
    enteredTurn: ctx.state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
  })
  pushLog(ctx.state, ctx.controller, `${name} arrives from the collection.`)
}

// 'Summon two Hellhounds from your collection to your Avatar's location.
//  They gain Charge this turn.'
registerScript('Release the Hounds', {
  onCast: (ctx) => {
    const avatar = Object.values(ctx.state.units).find((u) => u.isAvatar && u.controller === ctx.controller)
    if (!avatar) return
    for (let i = 0; i < 2; i++) {
      summonFromCollection(ctx, 'Hellhounds', avatar.x, avatar.y)
      const latest = Object.values(ctx.state.units).filter((u) => u.name === 'Hellhounds' && u.controller === ctx.controller).pop()
      if (latest) ctx.grantKeyword(latest.id, 'charge', 'endOfTurn')
    }
  },
})
