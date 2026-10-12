import { registerScript } from '../registry'
import { pushLog, effectSummonUnit } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'
import { collectionBanned, payZoneToll, takeFromCollection } from '../../../engine/statics'

// 'Deathrite → Summon a Ghoul from your collection to this site. It has
//  "Deathrite → Summon a Skeleton token to this site."'
registerScript('Those Who Linger', {
  deathrite: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || !siteAt(ctx.state, self.x, self.y)) return
    // "from your collection" — must actually own a Ghoul
    if ((ctx.state.players[ctx.controller].collection?.['Ghoul'] ?? 0) <= 0) {
      return pushLog(ctx.state, ctx.controller, 'No Ghoul in your collection to raise.')
    }
    if (collectionBanned(ctx.state, ctx.controller, 'Ghoul')) {
      return pushLog(ctx.state, ctx.controller, 'Every Ghoul in the collection was banished by the Legion of Gall.')
    }
    if (!payZoneToll(ctx.state, ctx.controller)) {
      return pushLog(ctx.state, ctx.controller, 'The Bureau of Occult Control demands (2) for collection access.')
    }
    takeFromCollection(ctx.state, ctx.controller, 'Ghoul') // consume the collection copy
    const cardId = `c${ctx.state.nextId++}`
    ctx.state.cards[cardId] = { id: cardId, name: 'Ghoul', owner: ctx.controller }
    const unitId = `u${ctx.state.nextId++}`
    // the Ghoul enters the realm from the collection → enter-triggers fire (FAQ
    // 1242). Ghoul has no genesis of its own.
    effectSummonUnit(ctx.state, {
      id: unitId, cardId, name: 'Ghoul', owner: ctx.controller, controller: ctx.controller,
      isAvatar: false, x: self.x, y: self.y, region: 'surface', tapped: false, damage: 0,
      enteredTurn: ctx.state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
      counters: { lingering: 1 },
    })
    pushLog(ctx.state, ctx.controller, 'Something else lingers where they fell…')
  },
})
