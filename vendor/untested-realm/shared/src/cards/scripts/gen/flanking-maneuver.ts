import { registerScript, type EffectAPI } from '../registry'
import { siteAt, unitsAt } from '../../../engine/grid'
import { oversizedTeleportPlacements, subsurfaceRegion } from '../../../engine/movement'
import type { GameState, PlayerId, Region, UnitState } from '../../../engine/types'

// 'Teleport any number of allies at one location to another location a chess
// knight's move away. Draw a card.'
// FAQ: the two locations needn't share a region — from a void to a site's surface or subsurface, say.
// "Any number": the caster chooses which of the allies there go (none, some or all).
type Sq = { x: number; y: number; region: Region }
type Place = { x: number; y: number; shape?: { dx: number; dy: number }[]; from?: { x: number; y: number } }

const alliesAt = (state: GameState, at: Sq, me: PlayerId): UnitState[] =>
  unitsAt(state, at.x, at.y, at.region).filter((u) => u.controller === me)

/** the location the chosen square/region names: a void square is only the void; a site has its surface
 *  and the subsurface its terrain gives it (Codex, Void) */
function landing(state: GameState, x: number, y: number, region: Region): Region {
  if (!siteAt(state, x, y)) return 'void'
  if (region === 'surface' || region === 'void') return 'surface'
  return subsurfaceRegion(state, x, y) ?? 'surface'
}

registerScript('Flanking Maneuver', {
  targets: [
    { what: 'square', count: 1, targeted: false, label: 'the allies\' location' },
    { what: 'square', count: 1, targeted: false, label: "a knight's move away" },
  ],
  // if a MULTI-SQUARE ally is in the stack being flanked, let the client offer its placement/rotation at
  // the destination (ctx.teleport applies the choice via flow.teleportPlace to that oversized unit). Its
  // part ON the chosen location is the anchor that lands a knight's move away.
  teleportPlacement: (state, targets) => {
    if (!('square' in targets[0]) || !('square' in targets[1])) return null
    const src = targets[0].square, dst = targets[1].square
    const u = unitsAt(state, src.x, src.y, src.region ?? 'surface').find((x) => x.size === '2x2' || (x.extraSquares?.length ?? 0) > 0)
    return u ? { unitId: u.id, dest: { x: dst.x, y: dst.y }, from: { x: src.x, y: src.y } } : null
  },
  onCast: (ctx) => {
    const [t1, t2] = ctx.targets
    if (!('square' in t1) || !('square' in t2)) return
    const dx = Math.abs(t1.square.x - t2.square.x)
    const dy = Math.abs(t1.square.y - t2.square.y)
    if (!((dx === 1 && dy === 2) || (dx === 2 && dy === 1))) return ctx.log("That is not a knight's move.")
    const src: Sq = { x: t1.square.x, y: t1.square.y, region: t1.square.region ?? 'surface' }
    const dst: Sq = { x: t2.square.x, y: t2.square.y, region: landing(ctx.state, t2.square.x, t2.square.y, t2.square.region ?? src.region) }
    const allies = alliesAt(ctx.state, src, ctx.controller)
    if (allies.length > 1) {
      // the oversized placement castSpell stashed would be cleared before the answer — carry it along
      const place = ctx.state.flow?.teleportPlace as Place | undefined
      ctx.ask(
        { kind: 'chooseTargets', title: 'Flanking Maneuver — which allies go?', data: { candidates: allies.map((u) => u.id), count: allies.length, upTo: true, kind: 'unit', notTargeted: true } },
        'flankWho',
        { src, dst, place },
      )
      return
    }
    flank(ctx, src, dst, allies.map((u) => u.id))
    ctx.drawCard(ctx.controller)
  },
  conts: {
    flankWho: (ctx, c: { src: Sq; dst: Sq; place?: Place }, choice) => {
      const picked: string[] = Array.isArray(choice) ? choice : typeof choice === 'string' ? [choice] : []
      if (c.place) ctx.state.flow = { ...(ctx.state.flow ?? {}), teleportPlace: c.place }
      flank(ctx, c.src, c.dst, picked)
      if (ctx.state.flow?.teleportPlace) delete ctx.state.flow.teleportPlace
      ctx.drawCard(ctx.controller)
    },
  },
})

/** the chosen allies still at `src` teleport to `dst` */
function flank(ctx: EffectAPI, src: Sq, dst: Sq, ids: string[]): void {
  for (const u of alliesAt(ctx.state, src, ctx.controller).filter((a) => ids.includes(a.id))) {
    // an oversized ally with no placement chosen (bot): its part here lands on the destination
    const multi = u.size === '2x2' || (u.extraSquares?.length ?? 0) > 0
    if (multi && !ctx.state.flow?.teleportPlace) {
      const pl = oversizedTeleportPlacements(ctx.state, u, dst, src)[0]
      if (pl) ctx.state.flow.teleportPlace = { x: pl.x, y: pl.y, shape: pl.shape, from: pl.from }
    }
    ctx.teleport(u.id, dst.x, dst.y, dst.region)
  }
}
