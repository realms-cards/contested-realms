import { registerScript } from '../registry'
import { getCard } from '../../db'
import { GRID_H, sitesOf } from '../../../engine/grid'
import { pushLog, checkStateBased, effectSummonUnit } from '../../../engine/effects'

// "Deal out your top spells, one to each site in your back row. Summon any that
// are minions and put the rest at the bottom of your spellbook. If you're on
// Death's Door, they gain Charge."
registerScript('Golden Dawn', {
  onCast: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    const backRow = ctx.controller === 0 ? 0 : GRID_H - 1
    const avatar = Object.values(ctx.state.units).find((u) => u.isAvatar && u.controller === ctx.controller)
    const door = !!avatar?.deathsDoor
    const bottom: string[] = []
    for (const site of sitesOf(ctx.state, ctx.controller)) {
      if (site.y !== backRow) continue
      const cardId = p.spellbook.shift()
      if (cardId === undefined) break
      const name = ctx.state.cards[cardId].name
      if (getCard(name).type === 'Minion') {
        const unitId = `u${ctx.state.nextId++}`
        // FAQ 1242 (Golden Dawn): "resolve any effects of those minions being
        // summoned, e.g. genesis effects." Route through the shared entry path.
        effectSummonUnit(ctx.state, {
          id: unitId, cardId, name, owner: ctx.state.cards[cardId].owner, controller: ctx.controller,
          isAvatar: false, x: site.x, y: site.y, region: 'surface', tapped: false, damage: 0,
          enteredTurn: ctx.state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
        })
        if (door && ctx.state.units[unitId]) ctx.grantKeyword(unitId, 'charge', 'permanent')
        pushLog(ctx.state, ctx.controller, `${name} rises with the dawn.`)
      } else {
        bottom.push(cardId)
      }
    }
    p.spellbook.push(...bottom)
    checkStateBased(ctx.state)
  },
})
