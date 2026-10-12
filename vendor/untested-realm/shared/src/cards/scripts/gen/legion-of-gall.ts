import { registerScript, type EffectAPI } from '../registry'
import { allCards } from '../../db'
import { pushLog, opponent } from '../../../engine/effects'
import { collectionBanned, payZoneToll, collectionNames } from '../../../engine/statics'
import type { PlayerId } from '../../../engine/types'

// ------------------------------------------------------------ Legion of Gall ----
// 'Airborne / Genesis → Look at a collection and banish three cards from it.'
function gallAsk(ctx: EffectAPI, target: PlayerId, taken: string[]): void {
  // the cards still available to banish from the (looked-at) collection
  const names = collectionNames(ctx.state, target).filter(
    (n) => !collectionBanned(ctx.state, target, n) && !taken.includes(n),
  )
  if (taken.length >= 3 || names.length === 0) {
    pushLog(
      ctx.state,
      ctx.controller,
      taken.length ? `The Legion of Gall carries off: ${taken.join(', ')}.` : 'That collection has nothing to banish.',
    )
    return
  }
  // render the looked-at collection as a clickable card grid (like the mulligan / Malleus
  // picker), not a free-text field. `names` is sent only to the caster (prompt data is
  // private), so "look at a collection" doesn't leak to the opponent.
  ctx.ask(
    {
      kind: 'nameCard',
      title: `Legion of Gall: banish which card from ${ctx.state.players[target].name}'s collection? (${taken.length}/3)`,
      data: { names, fromCollection: target === ctx.controller },
    },
    'gall',
    { target, taken },
  )
}

registerScript('Legion of Gall', {
  genesis: (ctx) => {
    ctx.ask({ kind: 'chooseOption', title: 'The Legion raids whose collection?', data: { options: ['yours', "your opponent's"] } }, 'whose')
  },
  conts: {
    whose: (ctx, _c, choice) => {
      const target = (choice === "your opponent's" ? opponent(ctx.controller) : ctx.controller) as PlayerId
      if (!payZoneToll(ctx.state, ctx.controller)) {
        return pushLog(ctx.state, ctx.controller, 'The Bureau of Occult Control demands (2) for collection access.')
      }
      gallAsk(ctx, target, [])
    },
    gall: (ctx, c, name) => {
      const target = c.target as PlayerId
      const taken = c.taken as string[]
      if (typeof name === 'string' && name && allCards.some((cd) => cd.name === name) && !collectionBanned(ctx.state, target, name)) {
        ctx.state.flow = ctx.state.flow ?? {}
        const bans = ctx.state.flow.collectionBans ?? { 0: [], 1: [] }
        bans[target] = [...(bans[target] ?? []), name]
        ctx.state.flow.collectionBans = bans
        gallAsk(ctx, target, [...taken, name])
      } else {
        gallAsk(ctx, target, taken)
      }
    },
  },
})
