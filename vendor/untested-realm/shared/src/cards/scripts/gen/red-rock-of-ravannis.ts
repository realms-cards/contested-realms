import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { inBounds, siteAt } from '../../../engine/grid'
import { isArtifactUnit, isCarriableArtifact } from '../../../engine/statics'

// "Artifacts can't be carried here. / At the end of each turn, pull each
//  artifact one step towards this site, along with its bearer."
registerScript('Red Rock of Ravannis', {
  blocksCarryingHere: true,
  endOfEveryTurn: (ctx) => {
    const self = ctx.state.artifacts[ctx.sourceId]
    if (!self) return
    // one step towards this site — the longer axis first; a pull never goes into the void
    const stepToward = (x: number, y: number): { x: number; y: number } | null => {
      const ddx = self.x - x
      const ddy = self.y - y
      const alongX = ddx ? { x: x + Math.sign(ddx), y } : null
      const alongY = ddy ? { x, y: y + Math.sign(ddy) } : null
      const order = Math.abs(ddx) >= Math.abs(ddy) ? [alongX, alongY] : [alongY, alongX]
      return order.find((s) => !!s && inBounds(s.x, s.y) && !!siteAt(ctx.state, s.x, s.y)) ?? null
    }
    const here = (p: { x: number; y: number }) => p.x === self.x && p.y === self.y
    // every pull is planned from where things stand now: a bearer is pulled ONCE, however many artifacts
    // it carries. A Monument never moves; an Automaton is an artifact that is a unit, pulled itself.
    const unitPulls = new Map<string, { x: number; y: number }>()
    const loosePulls: { id: string; to: { x: number; y: number } }[] = []
    for (const a of Object.values(ctx.state.artifacts)) {
      if (a.id === self.id || !isCarriableArtifact(a.name)) continue
      const bearer = a.carriedBy ? ctx.state.units[a.carriedBy] : undefined
      const from = bearer ?? a
      if (here(from)) continue
      const to = stepToward(from.x, from.y)
      if (!to) continue
      if (bearer) unitPulls.set(bearer.id, to)
      else loosePulls.push({ id: a.id, to })
    }
    for (const u of Object.values(ctx.state.units)) {
      if (!isArtifactUnit(ctx.state, u) || here(u) || unitPulls.has(u.id)) continue
      const to = stepToward(u.x, u.y)
      if (to) unitPulls.set(u.id, to)
    }
    for (const [id, to] of unitPulls) {
      const u = ctx.state.units[id]
      if (!u) continue
      const carried = [...u.carrying]
      ctx.teleport(id, to.x, to.y, u.region, { push: true }) // a forced pull: "can't be moved by force", Cage…
      // FAQ: "If the bearer of the artifact cannot be pulled, but the artifact can, the Red Rock pulls the
      // artifact out of the bearer's hands."
      for (const artId of carried) {
        const a = ctx.state.artifacts[artId]
        if (!a || (a.x === to.x && a.y === to.y)) continue
        const holder = a.carriedBy ? ctx.state.units[a.carriedBy] : undefined
        if (holder) holder.carrying = holder.carrying.filter((c) => c !== a.id)
        a.carriedBy = null
        a.x = to.x
        a.y = to.y
      }
    }
    for (const m of loosePulls) {
      const a = ctx.state.artifacts[m.id]
      if (a && !a.carriedBy) { a.x = m.to.x; a.y = m.to.y }
    }
    pushLog(ctx.state, ctx.controller, 'The Red Rock drags all metal toward itself.')
  },
})
