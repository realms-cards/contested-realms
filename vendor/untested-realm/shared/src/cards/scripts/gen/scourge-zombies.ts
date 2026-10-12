import { registerScript } from '../registry'
import { pushLog, effectSummonUnit } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'
import { effSubtypes, terrainAt } from '../../../engine/statics'

// 'Whenever an allied Mortal dies on land, you may summon Scourge Zombies from
//  your cemetery to its location, tapped.'
registerScript('Scourge Zombies', {
  listensFromCemetery: true,
  onAnyDeath: (ctx, dead) => {
    const p = ctx.state.players[ctx.controller]
    if (!p.cemetery.includes(ctx.sourceId)) return
    if (dead.isAvatar || dead.controller !== ctx.controller) return
    if (!effSubtypes(ctx.state, dead).includes('Mortal')) return
    if (terrainAt(ctx.state, dead.x, dead.y) !== 'land') return
    // "summon Scourge Zombies" is a SELF-reference — the card that holds the ability (Vivien, if she
    // copied it, revived as she were Scourge Zombies).
    const selfName = ctx.state.cards[ctx.sourceId].name
    ctx.ask({ kind: 'yesNo', title: `Summon ${selfName} (tapped) where ${dead.name} fell?` }, 'shamble', { x: dead.x, y: dead.y })
  },
  conts: {
    shamble: (ctx, c, yes) => {
      const p = ctx.state.players[ctx.controller]
      if (!yes || !p.cemetery.includes(ctx.sourceId)) return
      if (!siteAt(ctx.state, c.x as number, c.y as number)) return
      p.cemetery.splice(p.cemetery.indexOf(ctx.sourceId), 1)
      const unitId = `u${ctx.state.nextId++}`
      // it enters the realm from the cemetery → Genesis fires (FAQ 1242). The summoned card is the
      // one that held the ability (self-reference), so a copied ability revives the copier.
      effectSummonUnit(ctx.state, {
        id: unitId, cardId: ctx.sourceId, name: ctx.state.cards[ctx.sourceId].name, owner: ctx.state.cards[ctx.sourceId].owner,
        controller: ctx.controller, isAvatar: false, x: c.x as number, y: c.y as number, region: 'surface',
        tapped: true, damage: 0, enteredTurn: ctx.state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
      })
      pushLog(ctx.state, ctx.controller, 'The Scourge Zombies rise where the mortal fell.')
    },
  },
})
