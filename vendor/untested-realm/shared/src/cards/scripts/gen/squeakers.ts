import { registerScript } from '../registry'
import { pushLog, effectSummonUnit, revealCards } from '../../../engine/effects'
import { shuffleWithSeed } from '../../../engine/rng'

// 'Deathrite → Reveal your next five spells, then summon all Pigs of the
//  Sounder from among them to this site. Put the rest on the bottom in a random order.'
registerScript('Squeakers', {
  deathrite: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const p = ctx.state.players[ctx.controller]
    const top = p.spellbook.slice(0, 5)
    p.spellbook = p.spellbook.slice(top.length)
    const pigs = top.filter((id) => ctx.state.cards[id].name === 'Pigs of the Sounder')
    const rest = top.filter((id) => !pigs.includes(id))
    pushLog(ctx.state, ctx.controller, `Revealed: ${top.map((id) => ctx.state.cards[id].name).join(', ')}.`)
    for (const cardId of pigs) {
      const unitId = `u${ctx.state.nextId++}`
      // each Pig enters the realm from the spellbook → Genesis fires (FAQ 1242)
      effectSummonUnit(ctx.state, {
        id: unitId, cardId, name: 'Pigs of the Sounder', owner: ctx.state.cards[cardId].owner,
        controller: ctx.controller, isAvatar: false, x: self.x, y: self.y, region: 'surface',
        tapped: false, damage: 0, enteredTurn: ctx.state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
      })
    }
    if (pigs.length) pushLog(ctx.state, ctx.controller, 'The sounder stampedes in, squealing vengeance!')
    // the summoned Pigs are shown by their summon; reveal the REST (put on the bottom) to the opponent.
    revealCards(ctx.state, ctx.controller, rest.map((id) => ctx.state.cards[id].name))
    ctx.state.seed = shuffleWithSeed(rest, ctx.state.seed)
    p.spellbook.push(...rest)
  },
})
