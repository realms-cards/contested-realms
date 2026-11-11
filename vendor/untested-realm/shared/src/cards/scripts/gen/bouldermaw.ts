import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { collectionBanned, takeFromCollection } from '../../../engine/statics'
import type { GameState, PlayerId } from '../../../engine/types'
import { trapScript } from '../multi-card-utils/trap'
import { rollBoulder } from '../multi-card-utils/rolling-boulder'

// 'Trap (6) → Roll a Rolling Boulder in your collection from here.'
// The Boulder comes out of your collection onto this site and rolls in the direction you choose, as far
// as possible, dealing 4 damage to each unit along its path (nobody pushed it, so nobody here is spared).
// It then lies where it stopped, yours to push again.
const hasBoulder = (state: GameState, player: PlayerId) =>
  (state.players[player].collection?.['Rolling Boulder'] ?? 0) > 0 && !collectionBanned(state, player, 'Rolling Boulder')

registerScript('Bouldermaw', trapScript({
  label: 'roll a Rolling Boulder from your collection',
  mana: 6,
  effect: (ctx) => {
    if (!hasBoulder(ctx.state, ctx.controller)) return ctx.log('No Rolling Boulder in the collection — Bouldermaw yawns.')
    ctx.ask({ kind: 'chooseOption', title: 'Bouldermaw: roll the Boulder which way?', data: { options: ['n', 's', 'e', 'w'] } }, 'roll')
  },
  conts: {
    roll: (ctx, _c, dir) => {
      const site = ctx.state.sites[ctx.sourceId]
      if (!site || typeof dir !== 'string' || !['n', 's', 'e', 'w'].includes(dir) || !hasBoulder(ctx.state, ctx.controller)) return
      takeFromCollection(ctx.state, ctx.controller, 'Rolling Boulder')
      const cardId = `c${ctx.state.nextId++}`
      ctx.state.cards[cardId] = { id: cardId, name: 'Rolling Boulder', owner: ctx.controller }
      const artId = `a${ctx.state.nextId++}`
      const art = { id: artId, cardId, name: 'Rolling Boulder', conjuredBy: ctx.controller, x: site.x, y: site.y, region: 'surface' as const, carriedBy: null, tapped: false }
      ctx.state.artifacts[artId] = art
      pushLog(ctx.state, ctx.controller, 'Bouldermaw disgorges a Rolling Boulder!')
      rollBoulder(ctx, ctx.state.artifacts[artId], dir)
    },
  },
}))
