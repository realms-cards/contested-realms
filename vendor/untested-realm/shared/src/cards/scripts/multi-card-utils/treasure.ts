import { type CardScript } from '../registry'
import { getCard } from '../../db'
import { pushLog, opponent, toCemetery } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'

// Buried/Sunken Treasure: conjured underneath an allied site of the OPPONENT's
// choice; sacrificed for two cards when carried to the surface.
export function treasureScript(name: string, water: boolean): CardScript {
  return {
    genesis: (ctx) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      if (!art) return
      const spots = Object.values(ctx.state.sites)
        .filter((s) => s.controller === ctx.controller && !s.isRubble)
        .filter((s) => (s.flooded || getCard(s.name).thresholds.water > 0) === water)
        .map((s) => ({ x: s.x, y: s.y }))
      if (!spots.length) return
      ctx.ask(
        { kind: 'chooseSquare', title: `Hide the ${name} under which of their sites?`, data: { squares: spots }, player: opponent(ctx.controller) },
        'hide',
      )
    },
    onUnitEntersSquare: (ctx, moved) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      if (!art || art.carriedBy !== moved.id || moved.region !== 'surface') return
      const controller = moved.controller
      moved.carrying = moved.carrying.filter((id) => id !== art.id)
      const card = ctx.state.cards[art.cardId]
      if (card) toCemetery(ctx.state, card.id)
      delete ctx.state.artifacts[art.id]
      pushLog(ctx.state, controller, `The ${name} is unearthed — its finder profits!`)
      ctx.drawCard(controller, 2)
    },
    conts: {
      hide: (ctx, _c, sq) => {
        const art = ctx.state.artifacts[ctx.sourceId]
        if (!art || !sq || !siteAt(ctx.state, sq.x, sq.y)) return
        art.x = sq.x
        art.y = sq.y
        art.region = water ? 'underwater' : 'underground'
        pushLog(ctx.state, ctx.controller, `The ${name} sinks out of sight.`)
      },
    },
  }
}
