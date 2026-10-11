import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'

// 'Bearer is silenced and can't drop Magnetic Muzzle. / At the end of each
//  player's turn, if Magnetic Muzzle is abandoned, that player attaches it to a
//  nearby minion.'
registerScript('Magnetic Muzzle', {
  cantDrop: true,
  silencesUnit: (state, selfId, unit) => state.artifacts[selfId]?.carriedBy === unit.id,
  endOfEveryTurn: (ctx) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art || art.carriedBy) return
    const nearby = nearbySquaresW(ctx.state, art.x, art.y)
      .flatMap((s) => unitsAt(ctx.state, s.x, s.y, art.region))
      .filter((u) => !u.isAvatar)
      .map((u) => u.id)
    if (!nearby.length) return
    ctx.ask(
      { kind: 'chooseTargets', title: 'The Magnetic Muzzle snaps onto which nearby minion?', data: { candidates: nearby, count: 1, upTo: false, kind: 'unit' }, player: ctx.state.activePlayer },
      'snap',
    )
  },
  conts: {
    snap: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const art = ctx.state.artifacts[ctx.sourceId]
      const victim = typeof id === 'string' ? ctx.state.units[id] : null
      if (!art || art.carriedBy || !victim) return
      art.carriedBy = victim.id
      art.x = victim.x
      art.y = victim.y
      art.region = victim.region
      victim.carrying.push(art.id)
      pushLog(ctx.state, victim.controller, `CLANK — the Muzzle clamps onto ${victim.name}!`)
    },
  },
})
