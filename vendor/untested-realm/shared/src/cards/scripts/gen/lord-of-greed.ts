import { registerScript, type EffectAPI } from '../registry'
import { pushLog } from '../../../engine/effects'
import { awardAchievement } from '../../../engine/achievements.catalog'

// "Can't drop artifacts. / At the end of your turn, Lord of Greed snatches an
// artifact from elsewhere into his hands."
registerScript('Lord of Greed', {
  unitCantDrop: true,
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    // every artifact NOT already his is snatchable (prefer ones off his own square).
    // "AN artifact from elsewhere" → the controller chooses which (board-click) when 2+.
    const away = Object.values(ctx.state.artifacts).filter((a) => a.carriedBy !== self.id && !(a.x === self.x && a.y === self.y && !a.carriedBy))
    const pool = away.length ? away : Object.values(ctx.state.artifacts).filter((a) => a.carriedBy !== self.id)
    if (pool.length === 0) return
    if (pool.length === 1) return greedSnatch(ctx, self.id, pool[0].id)
    ctx.ask({ kind: 'chooseTargets', title: 'Lord of Greed — snatch which artifact?', data: { candidates: pool.map((a) => a.id), count: 1, kind: 'artifact' } }, 'greed', { self: self.id })
  },
  conts: {
    greed: (ctx, c: any, choice: any) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (id) greedSnatch(ctx, c.self as string, id)
    },
  },
})

// snatch an artifact into Lord of Greed's hands (detaching it from any current bearer)
function greedSnatch(ctx: EffectAPI, selfId: string, artId: string): void {
  const self = ctx.state.units[selfId]
  const loot = ctx.state.artifacts[artId]
  if (!self || !loot) return
  if (loot.carriedBy) {
    const carrier = ctx.state.units[loot.carriedBy]
    if (carrier) carrier.carrying = carrier.carrying.filter((i) => i !== loot.id)
  }
  loot.carriedBy = self.id
  loot.x = self.x; loot.y = self.y; loot.region = self.region
  self.carrying.push(loot.id)
  // Lord yo-yo — snatch back a Rolling Boulder that this same player pushed earlier this turn
  if (loot.name === 'Rolling Boulder' && loot.counters?.pushedTurn === ctx.state.turn && loot.counters?.pushedBy === self.controller)
    awardAchievement(ctx.state, 'lord-yoyo', self.controller)
  pushLog(ctx.state, self.controller, `Lord of Greed snatches ${loot.name}!`)
}
