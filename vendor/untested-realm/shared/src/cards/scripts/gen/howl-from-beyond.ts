import { registerScript } from '../registry'
import { getCard } from '../../db'
import { GRID_H, GRID_W, siteAt } from '../../../engine/grid'
import { cardSubtypesFor } from '../../../engine/statics'
import { pushLog } from '../../../engine/effects'

// 'Deal out your top spells, one to each void in the outer columns. Draw any
// minions with Voidwalk or Monsters from among them and banish the rest.'
registerScript('Howl from Beyond', {
  onCast: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    let voids = 0
    for (const x of [0, GRID_W - 1]) {
      for (let y = 0; y < GRID_H; y++) if (!siteAt(ctx.state, x, y)) voids++
    }
    for (let i = 0; i < voids; i++) {
      const id = p.spellbook.shift()
      if (id === undefined) break
      const name = ctx.state.cards[id].name
      const def = getCard(name)
      // "Monsters" honors a Corruptor (your Beasts are Monsters) — the spellbook card is yours.
      const keeper = def.type === 'Minion' && (/voidwalk/i.test(def.text) || cardSubtypesFor(ctx.state, ctx.controller, name).includes('Monster'))
      if (keeper) p.hand.push(id)
      else p.banished.push(id)
      pushLog(ctx.state, ctx.controller, `${name}: ${keeper ? 'answers the howl' : 'is lost to the beyond'}.`)
    }
  },
})
