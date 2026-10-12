import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { nearbySquaresW } from '../../../engine/grid'

// 'The first time each turn a Magic spell is cast nearby, Orb of Ba'al Berith
//  creates a copy. The spell's controller may choose new targets.'
registerScript("Orb of Ba'al Berith", {
  onSpellCast: (ctx, by, cardName) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art || getCard(cardName).type !== 'Magic') return
    const caster = Object.values(ctx.state.units).find((u) => u.isAvatar && u.controller === by)
    // "nearby" is judged from the caster's Avatar side — the spell's origin
    const near = Object.values(ctx.state.units).some(
      (u) => u.controller === by && nearbySquaresW(ctx.state, art.x, art.y).some((s) => s.x === u.x && s.y === u.y),
    ) || (caster && nearbySquaresW(ctx.state, art.x, art.y).some((s) => s.x === caster.x && s.y === caster.y))
    if (!near) return
    if (art.counters?.copiedTurn === ctx.state.turn) return
    art.counters = { ...art.counters, copiedTurn: ctx.state.turn }
    // a free token copy appears in the caster's hand (Archimago pattern)
    const copyId = `c${ctx.state.nextId++}`
    ctx.state.cards[copyId] = { id: copyId, name: cardName, owner: by, isToken: true }
    ctx.state.players[by].hand.push(copyId)
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.freeCast = [...(ctx.state.flow.freeCast ?? []), copyId]
    pushLog(ctx.state, by, `The Orb of Ba'al Berith echoes ${cardName} — cast the copy for free.`)
  },
})
