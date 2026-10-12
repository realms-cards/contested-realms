import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'May be cast into the hands of any unit already carrying an artifact to banish
// that artifact.'
registerScript('Just a Rock', {
  genesis: (ctx) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    const holder = art?.carriedBy ? ctx.state.units[art.carriedBy] : null
    if (!art || !holder) return
    const other = holder.carrying.find((id) => id !== art.id && ctx.state.artifacts[id])
    if (other) {
      const victim = ctx.state.artifacts[other]!
      holder.carrying = holder.carrying.filter((id) => id !== other)
      const card = ctx.state.cards[victim.cardId]
      if (card && !card.isToken) ctx.state.players[card.owner].banished.push(card.id)
      delete ctx.state.artifacts[other]
      pushLog(ctx.state, ctx.controller, `${victim.name} is replaced with... just a rock.`)
    }
  },
})
