import { registerScript } from '../registry'

// 'Banish target minion nearby, and everything it carries.'
registerScript('Disintegrate', {
  targets: [{ what: 'minion', count: 1, targeted: true, where: 'nearby', label: 'target minion nearby' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    for (const artId of [...u.carrying]) {
      // "and everything it carries" goes to the banished pile too (a token simply leaves the game)
      const card = ctx.state.cards[ctx.state.artifacts[artId]?.cardId ?? '']
      if (card && !card.isToken) ctx.state.players[card.owner].banished.push(card.id)
      delete ctx.state.artifacts[artId]
    }
    u.carrying = []
    for (const riderId of [...u.carryingUnits]) ctx.banish(riderId) // carried units are "everything it carries" too
    ctx.banish(u.id)
  },
})
