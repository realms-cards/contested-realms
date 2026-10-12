import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog, checkStateBased, emitUnitMoved } from '../../../engine/effects'
import { syncCarried } from '../../../engine/carrying'

// 'Swap the location of target minion or artifact with another target minion or artifact.'
registerScript('Swap', {
  onCast: (ctx) => {
    // Swap is a TARGETED spell: both targets must lie in the caster's region (rulebook — "a target must
    // be in the same region as the caster"). So only offer minions/artifacts sharing that region; a
    // carried artifact takes its bearer's region.
    const region = ctx.caster?.region ?? 'surface'
    const artRegion = (a: { carriedBy?: string | null; region: string }) =>
      a.carriedBy ? ctx.state.units[a.carriedBy]?.region ?? a.region : a.region
    const things = [
      ...Object.values(ctx.state.units).filter((u) => !u.isAvatar && u.region === region).map((u) => u.id),
      // carried artifacts CAN be swapped (they leave the bearer) — Monuments are immovable
      ...Object.values(ctx.state.artifacts).filter((a) => artRegion(a) === region && !getCard(a.name).subtypes.includes('Monument')).map((a) => a.id),
    ]
    if (things.length < 2) return ctx.log('Nothing to swap.')
    ctx.ask({ kind: 'chooseTargets', title: 'Swap: pick the first minion (or click again for artifacts by square).', data: { candidates: things, count: 2, upTo: false, kind: 'unit' } }, 'swap')
  },
  conts: {
    swap: (ctx, _c, choice) => {
      const ids = Array.isArray(choice) ? choice : []
      if (ids.length !== 2) return
      const a = ctx.state.units[ids[0]] ?? ctx.state.artifacts[ids[0]]
      const b = ctx.state.units[ids[1]] ?? ctx.state.artifacts[ids[1]]
      if (!a || !b) return
      // a swapped carried thing (artifact OR unit) leaves its bearer — detach so it truly relocates
      const detach = (id: string) => {
        const cu = ctx.state.units[id]
        if (cu?.carriedBy) { const c = ctx.state.units[cu.carriedBy]; if (c) c.carryingUnits = c.carryingUnits.filter((x) => x !== id); cu.carriedBy = null }
        const ca = ctx.state.artifacts[id]
        if (ca?.carriedBy) { const c = ctx.state.units[ca.carriedBy]; if (c) c.carrying = c.carrying.filter((x) => x !== id); ca.carriedBy = null }
      }
      detach(ids[0]); detach(ids[1])
      const aFrom = { x: a.x, y: a.y, region: a.region }
      const bFrom = { x: b.x, y: b.y, region: b.region }
      a.x = b.x
      a.y = b.y
      a.region = b.region
      b.x = aFrom.x
      b.y = aFrom.y
      b.region = aFrom.region
      // a swapped carrier brings its cargo along, and a swapped UNIT "enters" its new square
      // (fires onUnitEntersSquare — the Druid's thorns, Dark Alley, etc. — like any forced move)
      const ua = ctx.state.units[ids[0]]; if (ua) { syncCarried(ctx.state, ua); emitUnitMoved(ctx.state, ua, aFrom) }
      const ub = ctx.state.units[ids[1]]; if (ub) { syncCarried(ctx.state, ub); emitUnitMoved(ctx.state, ub, bFrom) }
      pushLog(ctx.state, ctx.controller, `${a.name} and ${b.name} trade places in a blink.`)
      checkStateBased(ctx.state)
    },
  },
})
