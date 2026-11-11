import { registerScript } from '../registry'
import { pushLog, opponent } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'

// 'Whenever the flame stops at a new site, you heal 1 and your opponent loses 1 life.'
registerScript('Flame of the First Ones', {
  onUnitEntersSquare: (ctx, moved, _from, _via, final) => {
    if (final === false) return // "whenever the flame STOPS at a new site" — not squares merely passed through
    const art = ctx.state.artifacts[ctx.sourceId]
    // carried in by `moved` — or dropped there as its bearer died on arrival (Briar Patch): the flame still
    // stopped at the new site, for the player who controlled it as it stopped (the listener's controller)
    if (!art || (art.carriedBy !== moved.id && !(art.carriedBy === null && art.droppedBy === moved.id))) return
    const site = siteAt(ctx.state, moved.x, moved.y)
    if (!site) return
    const key = `flame:${site.id}`
    if (art.counters?.[key]) return
    art.counters = { ...art.counters, [key]: 1 }
    ctx.gainLife(ctx.controller, 1)
    ctx.loseLife(opponent(ctx.controller), 1)
    pushLog(ctx.state, ctx.controller, 'The First Flame burns brighter at a new hearth.')
  },
})
