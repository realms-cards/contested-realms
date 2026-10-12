import { registerScript, getScript, type EffectAPI } from '../registry'
import { inBounds, siteAt, unitsAt } from '../../../engine/grid'
import { pushLog } from '../../../engine/effects'

// 'Units here have "Tap → Give Rolling Boulder a push. It rolls as far as
//  possible and deals 4 damage to each other unit along its path."'
registerScript('Rolling Boulder', {
  artifactGrantsAbilities: (state, artifactId, unit) => {
    const art = state.artifacts[artifactId]
    // "Units here" = wherever the Boulder sits — including when it's being carried,
    // in which case its location is the carrier's, so units there (the carrier and
    // any others) can still push it.
    if (!art || unit.x !== art.x || unit.y !== art.y || unit.region !== art.region) return []
    return [{
      key: 'boulder:push',
      label: 'Push the Rolling Boulder',
      cost: { tap: true },
      effect: (ctx) => {
        ctx.ask({ kind: 'chooseOption', title: 'Push the Boulder which way?', data: { options: ['n', 's', 'e', 'w'] } }, 'roll')
      },
      // conts live on the granting artifact's script (Rolling Boulder), keyed below
    }]
  },
  conts: {},
})
// the push resolves via a global cont on the pusher's context, so register it on the artifact
// script directly (same file → runs right after the registration above, so getScript is defined):
;(getScript('Rolling Boulder') as any).conts = {
  roll: (ctx: EffectAPI, _c: any, dir: unknown) => {
    const pusher = ctx.state.units[ctx.sourceId]
    // find the Boulder at the pusher's location — carried or not (a carried Boulder
    // sits at its carrier's square, which is the pusher's square)
    const art = Object.values(ctx.state.artifacts).find(
      (a) => a.name === 'Rolling Boulder' && pusher && a.x === pusher.x && a.y === pusher.y,
    )
    if (!art || typeof dir !== 'string') return
    const dx = dir === 'e' ? 1 : dir === 'w' ? -1 : 0
    const dy = dir === 'n' ? 1 : dir === 's' ? -1 : 0
    const startX = art.x
    const startY = art.y
    let { x, y } = art
    // the Boulder's OWN square is the start of its path: units sharing the site it
    // was resting on are crushed too (only the pusher is spared) — they were being
    // ignored, so enemies standing on the Boulder's site escaped unharmed.
    // the Boulder crushes along its OWN region (it can be buried/submerged, not just surface)
    for (const u of unitsAt(ctx.state, startX, startY, art.region)) {
      if (u.id !== ctx.sourceId) ctx.dealDamage({ unit: u.id }, 4)
    }
    for (;;) {
      const nx = x + dx
      const ny = y + dy
      if (!inBounds(nx, ny) || !siteAt(ctx.state, nx, ny)) break
      x = nx
      y = ny
      for (const u of unitsAt(ctx.state, x, y, art.region)) {
        if (u.id !== ctx.sourceId) ctx.dealDamage({ unit: u.id }, 4)
      }
    }
    // if the Boulder actually rolled away from a carrier, it's dropped (it no longer
    // shares the carrier's location)
    if (art.carriedBy && (x !== startX || y !== startY)) {
      const carrier = ctx.state.units[art.carriedBy]
      if (carrier) carrier.carrying = carrier.carrying.filter((id) => id !== art.id)
      art.carriedBy = null
    }
    art.x = x
    art.y = y
    // remember who pushed it this turn — the Lord of Greed "yo-yo" achievement reads this on snatch-back
    art.counters = { ...art.counters, pushedTurn: ctx.state.turn, pushedBy: ctx.controller }
    pushLog(ctx.state, ctx.controller, `The Boulder thunders to a stop at (${x + 1},${y + 1}).`)
  },
}
