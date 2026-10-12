import { type EffectAPI } from '../registry'
import { pushLog, effectSummonUnit } from '../../../engine/effects'
import { collectionBanned, takeFromCollection } from '../../../engine/statics'
import type { UnitState } from '../../../engine/types'

/** a fresh real copy from the player's collection enters the realm */
export function fromCollection(ctx: EffectAPI, name: string, x: number, y: number, region: 'surface' | 'underwater' | 'underground' = 'surface'): UnitState | null {
  // "from your collection": you must actually own a copy (and it mustn't be banned).
  // Consume it — no summoning cards you don't have.
  if ((ctx.state.players[ctx.controller].collection?.[name] ?? 0) <= 0) {
    ctx.log(`No ${name} in your collection.`)
    return null
  }
  if (collectionBanned(ctx.state, ctx.controller, name)) {
    ctx.log(`Every ${name} in the collection was banished by the Legion of Gall.`)
    return null
  }
  takeFromCollection(ctx.state, ctx.controller, name)
  const cardId = `c${ctx.state.nextId++}`
  ctx.state.cards[cardId] = { id: cardId, name, owner: ctx.controller }
  const unitId = `u${ctx.state.nextId++}`
  const u: UnitState = {
    id: unitId, cardId, name, owner: ctx.controller, controller: ctx.controller,
    isAvatar: false, x, y, region, tapped: false, damage: 0,
    enteredTurn: ctx.state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
  }
  pushLog(ctx.state, ctx.controller, `${name} arrives from the collection.`)
  // a real copy enters the realm from the collection → Genesis fires (FAQ 1242)
  return effectSummonUnit(ctx.state, u)
}
