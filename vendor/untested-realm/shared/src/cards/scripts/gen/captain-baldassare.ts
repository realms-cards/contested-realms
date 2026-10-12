import { registerScript } from '../registry'
import { pushLog, opponent } from '../../../engine/effects'
import type { PlayerId } from '../../../engine/types'
import { plunderCard } from '../multi-card-utils/plunder-card'

// 'Whenever Captain Baldassare attacks a unit or site, the defending player
//  discards their topmost three spells. You may cast each of those spells once
//  this turn, ignoring threshold requirements.'
registerScript('Captain Baldassare', {
  afterAttack: (ctx, _attacker, targetUnitId, siteId) => {
    // resolve the defending player from what remains in the state
    let who: PlayerId
    if (targetUnitId && ctx.state.units[targetUnitId]) who = ctx.state.units[targetUnitId].controller
    else if (siteId && ctx.state.sites[siteId] && ctx.state.sites[siteId].controller !== null) who = ctx.state.sites[siteId].controller as PlayerId
    else who = opponent(ctx.controller)
    const foe = ctx.state.players[who]
    for (let i = 0; i < 3; i++) {
      const cardId = foe.spellbook.shift()
      if (cardId === undefined) break
      plunderCard(ctx, cardId)
    }
    pushLog(ctx.state, ctx.controller, 'Captain Baldassare plunders their spellbook!')
  },
})
