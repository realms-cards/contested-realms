import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'During your opponent's turn, this is a 5 power Angel Automaton with Airborne.'
registerScript('Tombstone Wardens', {
  startOfEachTurn: (ctx, activePlayer) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (art && activePlayer !== ctx.controller && !art.carriedBy) {
      // rise for the enemy's turn
      const unitId = `u${ctx.state.nextId++}`
      ctx.state.units[unitId] = {
        id: unitId, cardId: art.cardId, name: art.name, owner: ctx.state.cards[art.cardId]?.owner ?? ctx.controller,
        controller: ctx.controller, isAvatar: false, x: art.x, y: art.y, region: 'surface',
        tapped: false, damage: 0, enteredTurn: 0, // no summoning sickness: it defends
        modifiers: [{ kind: 'power', amount: 5, duration: 'permanent', turn: ctx.state.turn, sourcePlayer: ctx.controller }],
        carrying: [], carryingUnits: [], usedThisTurn: {}, counters: { tombstoneRisen: 1 },
      }
      delete ctx.state.artifacts[ctx.sourceId]
      pushLog(ctx.state, ctx.controller, 'The Tombstone Wardens rise to stand vigil.')
      return
    }
    // fold back to stone on the controller's own turn
    if (activePlayer === ctx.controller) {
      const risen = Object.values(ctx.state.units).find(
        (u) => u.name === 'Tombstone Wardens' && u.counters?.tombstoneRisen && u.controller === ctx.controller,
      )
      if (risen) {
        const artId = `a${ctx.state.nextId++}`
        ctx.state.artifacts[artId] = {
          id: artId, cardId: risen.cardId, name: risen.name, conjuredBy: ctx.controller,
          x: risen.x, y: risen.y, region: 'surface', carriedBy: null, tapped: false,
        }
        delete ctx.state.units[risen.id]
        pushLog(ctx.state, ctx.controller, 'The Wardens fold back into silent stone.')
      }
    }
  },
  selfSubtypes: (_state, self, printed) => {
    if (!self.counters?.tombstoneRisen) return printed
    const out = [...printed]
    for (const t of ['Angel', 'Automaton']) if (!out.includes(t)) out.push(t)
    return out
  },
  selfKeywords: (_state, self) => (self.counters?.tombstoneRisen ? ['airborne'] : []),
})
