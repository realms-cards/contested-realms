import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog, effectSummonUnit } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'

// 'Whenever you play an earth site, you may summon Bone Rabble from your
//  cemetery to that site.'
registerScript('Bone Rabble', {
  listensFromCemetery: true,
  onSitePlayed: (ctx, by, site) => {
    // "summon Bone Rabble" is a SELF-reference: the name on the card means "THIS card". So the
    // ability summons whatever card currently carries it (ctx.sourceId) — normally Bone Rabble, but
    // Vivien the Enchantress if SHE has copied it (revived as she was Bone Rabble). ctx.sourceId is
    // the card id in the cemetery.
    const p = ctx.state.players[ctx.controller]
    if (by !== ctx.controller || !p.cemetery.includes(ctx.sourceId)) return
    if (getCard(site.name).thresholds.earth === 0) return
    const selfName = ctx.state.cards[ctx.sourceId].name
    ctx.ask({ kind: 'yesNo', title: `Summon ${selfName} from your cemetery to ${site.name}?` }, 'rattle', { x: site.x, y: site.y })
  },
  conts: {
    rattle: (ctx, c, yes) => {
      const p = ctx.state.players[ctx.controller]
      if (!yes || !p.cemetery.includes(ctx.sourceId)) return
      if (!siteAt(ctx.state, c.x as number, c.y as number)) return
      p.cemetery.splice(p.cemetery.indexOf(ctx.sourceId), 1)
      const unitId = `u${ctx.state.nextId++}`
      // it enters the realm from the cemetery → Genesis fires (FAQ 1242). The card summoned is the
      // one that held the ability (self-reference), so a copied ability revives the copier.
      effectSummonUnit(ctx.state, {
        id: unitId, cardId: ctx.sourceId, name: ctx.state.cards[ctx.sourceId].name, owner: ctx.state.cards[ctx.sourceId].owner,
        controller: ctx.controller, isAvatar: false, x: c.x as number, y: c.y as number, region: 'surface',
        tapped: false, damage: 0, enteredTurn: ctx.state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
      })
      pushLog(ctx.state, ctx.controller, 'The Bone Rabble claws up through the fresh earth!')
    },
  },
})
