import { registerScript } from '../registry'
import { pushLog, effectSummonUnit } from '../../../engine/effects'
import { nearbySquaresW } from '../../../engine/grid'
import { collectionBanned, takeFromCollection, payZoneToll } from '../../../engine/statics'

// "Genesis → Summon two Ghouls from your collection here. They can't die while nearby."
registerScript('Young Master Damion', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    if (collectionBanned(ctx.state, ctx.controller, 'Ghoul')) {
      return pushLog(ctx.state, ctx.controller, 'Every Ghoul in the collection was banished by the Legion of Gall.')
    }
    // one collection access for the pair of Ghouls → the Bureau of Occult Control tolls (2) once
    if ((ctx.state.players[ctx.controller].collection?.['Ghoul'] ?? 0) > 0 && !payZoneToll(ctx.state, ctx.controller)) {
      return pushLog(ctx.state, ctx.controller, 'The Bureau of Occult Control demands (2) for collection access.')
    }
    let summoned = 0
    for (let i = 0; i < 2; i++) {
      // "from your collection" — only summon a Ghoul you actually own; consume it
      if ((ctx.state.players[ctx.controller].collection?.['Ghoul'] ?? 0) <= 0) break
      takeFromCollection(ctx.state, ctx.controller, 'Ghoul')
      summoned++
      const cardId = `c${ctx.state.nextId++}`
      ctx.state.cards[cardId] = { id: cardId, name: 'Ghoul', owner: ctx.controller }
      const unitId = `u${ctx.state.nextId++}`
      // the Ghouls enter the realm from the collection → enter-triggers fire (FAQ
      // 1242). Ghoul has no genesis of its own, so no genesis-within-genesis chain.
      effectSummonUnit(ctx.state, {
        id: unitId, cardId, name: 'Ghoul', owner: ctx.controller, controller: ctx.controller,
        isAvatar: false, x: self.x, y: self.y, region: self.region, tapped: false, damage: 0,
        enteredTurn: ctx.state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
        counters: { damionsOwn: 1 },
      })
    }
    if (summoned > 0) pushLog(ctx.state, ctx.controller, "Young Master Damion's playmates crawl out to join him.")
    else pushLog(ctx.state, ctx.controller, 'No Ghouls in the collection answer Damion.')
  },
  onWouldDie: (state, selfId, dying) => {
    if (!dying.counters?.damionsOwn) return false
    const damion = state.units[selfId]
    if (!damion || damion.name !== 'Young Master Damion') return false
    if (!nearbySquaresW(state, damion.x, damion.y).some((s) => s.x === dying.x && s.y === dying.y)) return false
    dying.damage = 0
    pushLog(state, damion.controller, `Damion stamps his foot — his Ghoul refuses to die.`)
    return true
  },
})
