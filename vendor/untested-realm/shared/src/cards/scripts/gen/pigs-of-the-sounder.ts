import { registerScript } from '../registry'
import { pushLog, effectSummonUnit, revealCards } from '../../../engine/effects'
import { shuffleWithSeed } from '../../../engine/rng'

// 'Deathrite → Reveal your next five spells, then summon all Grand Old Boars from
// among them to this site. Put the rest on the bottom in a random order.'
registerScript('Pigs of the Sounder', {
  deathrite: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const p = ctx.state.players[ctx.controller]
    const top = p.spellbook.splice(0, 5)
    pushLog(ctx.state, ctx.controller, `Revealed: ${top.map((id) => ctx.state.cards[id].name).join(', ')}`)
    const rest: string[] = []
    for (const id of top) {
      if (ctx.state.cards[id].name === 'Grand Old Boar') {
        const unitId = `u${ctx.state.nextId++}`
        // the Boar enters the realm from the spellbook → Genesis fires (FAQ 1242)
        effectSummonUnit(ctx.state, {
          id: unitId, cardId: id, name: 'Grand Old Boar', owner: ctx.state.cards[id].owner,
          controller: ctx.controller, isAvatar: false, x: self.x, y: self.y, region: 'surface',
          tapped: false, damage: 0, enteredTurn: ctx.state.turn, modifiers: [], carrying: [],
          carryingUnits: [], usedThisTurn: {},
        })
        pushLog(ctx.state, ctx.controller, 'A Grand Old Boar charges in, furious!')
      } else {
        rest.push(id)
      }
    }
    // the summoned Boars are shown by their summon; reveal the REST (put on the bottom) to the opponent.
    revealCards(ctx.state, ctx.controller, rest.map((id) => ctx.state.cards[id].name))
    ctx.state.seed = shuffleWithSeed(rest, ctx.state.seed)
    p.spellbook.push(...rest)
  },
})
