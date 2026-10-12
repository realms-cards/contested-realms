import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { effAttack } from '../../../engine/statics'

// 'Genesis → Lock all minions with 2 or less power in this cage, tapped and disabled.'
// FAQ: the locked minions are TELEPORTED into the Cage and CARRIED by it — they ride with the Cage,
// stay tapped + disabled while caged, are freed if no longer carried, and only teleportation-based
// forced movement (Blink/Swap) can pull them out (River Rapids/Riptide/Scatter can't). The carry
// link lives in flow.cagedUnits; drag-with-cage + free-when-gone are handled in checkStateBased,
// and the teleport-vs-push escape rule in the ctx.teleport primitive.
registerScript('Cage of Sidrak', {
  genesis: (ctx) => {
    const cage = ctx.state.artifacts[ctx.sourceId]
    if (!cage) return
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.cagedUnits = ctx.state.flow.cagedUnits ?? []
    const targets = Object.values(ctx.state.units)
      .filter((u) => !u.isAvatar && effAttack(ctx.state, u) <= 2)
      .map((u) => u.id)
    let n = 0
    for (const id of targets) {
      const u = ctx.state.units[id]
      if (!u) continue
      ctx.teleport(id, cage.x, cage.y, cage.region ?? 'surface') // a genuine teleport into the Cage
      const now = ctx.state.units[id]
      if (!now || now.x !== cage.x || now.y !== cage.y) continue // couldn't be locked in (move-protected / can't enter)
      now.tapped = true
      now.counters = { ...now.counters, caged: 1 }
      ctx.state.flow.cagedUnits.push({ unitId: id, cageId: cage.id })
      n++
    }
    if (n) pushLog(ctx.state, ctx.controller, `The Cage of Sidrak clangs shut around ${n} small souls.`)
  },
  disablesOther: (state, selfId, unit) => !!state.artifacts[selfId] && !!unit.counters?.caged,
})
