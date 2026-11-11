import { registerScript, type EffectAPI } from '../registry'
import { nearbySquaresW, siteAt, unitsAt } from '../../../engine/grid'
import type { GameState, SiteState } from '../../../engine/types'
import { trapScript } from '../multi-card-utils/trap'

// 'Trap (1) → Fling a unit atop this site onto a nearby site.'
// Not targeting: any unit on this site's surface, flung onto the surface of another site nearby. A fling
// moves it "directly to a specified location without taking any steps in between" — teleportation (the
// rulebook's definition), whatever the distance or a Magellan-joined edge: forced movement, so "can't be
// moved by force" holds it, and like any teleport it frees a minion from the Cage of Sidrak.
const atop = (state: GameState, site: SiteState) => unitsAt(state, site.x, site.y, 'surface')
const landings = (state: GameState, site: SiteState) =>
  nearbySquaresW(state, site.x, site.y).filter((s) => (s.x !== site.x || s.y !== site.y) && siteAt(state, s.x, s.y))

function askLanding(ctx: EffectAPI, unitId: string): void {
  const site = ctx.state.sites[ctx.sourceId]
  if (!site) return
  const squares = landings(ctx.state, site)
  if (squares.length === 1) return fling(ctx, unitId, squares[0])
  ctx.ask({ kind: 'chooseSquare', title: 'Springstem Meadow: fling it onto which site?', data: { squares } }, 'land', { unitId })
}

function fling(ctx: EffectAPI, unitId: string, sq: { x: number; y: number }): void {
  const u = ctx.state.units[unitId]
  if (!u) return
  if (ctx.teleport(unitId, sq.x, sq.y, 'surface')) ctx.log(`${u.name} is flung through the air!`)
}

registerScript('Springstem Meadow', trapScript({
  label: 'fling a unit atop it onto a nearby site',
  mana: 1,
  effect: (ctx, site) => {
    const units = atop(ctx.state, site)
    if (!landings(ctx.state, site).length) return
    if (units.length === 1) return askLanding(ctx, units[0].id)
    if (units.length > 1) {
      ctx.ask({ kind: 'chooseTargets', title: 'Springstem Meadow: fling which unit?', data: { candidates: units.map((u) => u.id), count: 1, kind: 'unit', notTargeted: true } }, 'pick')
    }
  },
  conts: {
    pick: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const site = ctx.state.sites[ctx.sourceId]
      if (typeof id === 'string' && site && atop(ctx.state, site).some((u) => u.id === id)) askLanding(ctx, id)
    },
    land: (ctx, c, sq) => {
      const site = ctx.state.sites[ctx.sourceId]
      // still atop the Meadow when the landing is chosen, and still a nearby site to land on
      if (!site || !sq || !atop(ctx.state, site).some((u) => u.id === c.unitId)) return
      if (landings(ctx.state, site).some((s) => s.x === sq.x && s.y === sq.y)) fling(ctx, c.unitId as string, sq)
    },
  },
}))
