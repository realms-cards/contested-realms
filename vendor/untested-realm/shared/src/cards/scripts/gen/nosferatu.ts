import { registerScript } from '../registry'
import { GRID_H, GRID_W } from '../../../engine/grid'
import { terrainAt } from '../../../engine/statics'
import { pushLog, effectSummonUnit } from '../../../engine/effects'

// 'Airborne, Burrowing / Deathrite → Resummon Nosferatu beneath your starting
// square. If he dies again this turn, banish him instead.'
registerScript('Nosferatu', {
  deathrite: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    if (self.counters?.diedTurn === ctx.state.turn) {
      pushLog(ctx.state, ctx.controller, 'Nosferatu is destroyed for good.')
      ctx.banish(self.id)
      return
    }
    const x = Math.floor(GRID_W / 2)
    const y = ctx.controller === 0 ? 0 : GRID_H - 1
    if (terrainAt(ctx.state, x, y) !== 'land') return // no underground to seep into
    // remove the dying body ourselves (killUnit then skips the cemetery), and
    // resummon a fresh Nosferatu beneath the starting square
    const cardId = self.cardId
    delete ctx.state.units[self.id]
    const unitId = `u${ctx.state.nextId++}`
    // Nosferatu re-enters the realm underground → enter-triggers fire (FAQ 1242).
    // (Nosferatu itself has no genesis; this keeps entry handling consistent.)
    effectSummonUnit(ctx.state, {
      id: unitId, cardId, name: ctx.state.cards[cardId]?.name ?? 'Nosferatu', owner: ctx.state.cards[cardId]?.owner ?? ctx.controller,
      controller: ctx.controller, isAvatar: false, x, y, region: 'underground', tapped: false,
      damage: 0, enteredTurn: ctx.state.turn, modifiers: [], carrying: [], carryingUnits: [],
      usedThisTurn: {}, counters: { diedTurn: ctx.state.turn },
    })
    pushLog(ctx.state, ctx.controller, 'Nosferatu seeps into the earth, unquiet...')
  },
})
