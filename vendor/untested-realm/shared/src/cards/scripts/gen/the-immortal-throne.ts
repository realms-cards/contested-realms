import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { pushLog, recordLevelUp } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'
import type { PlayerId } from '../../../engine/types'

// 'Whenever anyone plays a card with cost equal to the number of level counters
//  on The Immortal Throne, they draw a card and add a level counter. /
//  At level 8 or more, an Avatar here alone wins the game.'
registerScript('The Immortal Throne', {
  onSpellCast: (ctx, by, cardName) => throneLevel(ctx, by, getCard(cardName).cost ?? 0),
  onSitePlayed: (ctx, by) => throneLevel(ctx, by, 0),
  endOfEveryTurn: (ctx) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art || (art.counters?.level ?? 0) < 8) return
    // "an Avatar here alone" = the Throne's OWN location (its region — a Throne can be buried/submerged),
    // not a hardcoded surface. An avatar can't dive, so a submerged Throne simply never wins.
    const here = unitsAt(ctx.state, art.x, art.y, art.region)
    if (here.length === 1 && here[0].isAvatar) {
      ctx.state.winner = here[0].controller
      ctx.state.phase = 'over'
      pushLog(ctx.state, here[0].controller, `${here[0].name} claims The Immortal Throne — victory!`)
    }
  },
})

function throneLevel(ctx: EffectAPI, by: PlayerId, cost: number): void {
  const art = ctx.state.artifacts[ctx.sourceId]
  if (!art) return
  const level = art.counters?.level ?? 0
  if (cost !== level) return
  art.counters = { ...art.counters, level: level + 1 }
  ctx.drawCard(by)
  recordLevelUp(ctx.state, art.x, art.y, level + 1)
  pushLog(ctx.state, by, `The Immortal Throne rises to level ${level + 1}.`)
}
