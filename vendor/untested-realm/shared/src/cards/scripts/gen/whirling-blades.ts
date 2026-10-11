import { registerScript, type EffectAPI } from '../registry'
import { strikeAllSimultaneous } from '../../../engine/effects'
import { nearbySquaresW, orthAdjacentWrapped, unitsAt } from '../../../engine/grid'
import { effKeywords } from '../../../engine/statics'
import { isLegalStep } from '../../../engine/movement'

// 'An ally may take up to two steps, and then strikes each enemy along their entire path.'
registerScript('Whirling Blades', {
  // "an ally" (not "an allied minion") — so it may target your Avatar too
  targets: [{ what: 'unit', count: 1, targeted: false, owner: 'ally', label: 'an ally' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('unit' in t)) return
    whirlStep(ctx, t.unit, [{ x: 0, y: 0 }], 0)
  },
  conts: {
    whirl: (ctx, c, sq) => {
      const ally = ctx.state.units[c.unitId as string]
      if (!ally) return
      const path = c.path as { x: number; y: number }[]
      // one step: airborne allies step diagonally too (FAQ: they may use move abilities),
      // so accept Chebyshev-1 for flyers, Manhattan-1 for the grounded.
      const air = !!effKeywords(ctx.state, ally).airborne
      // Magellan-aware, mirroring whirlStep's candidate set: flyers step to any of the 8 wrapped
      // neighbours, the grounded to the 4 wrapped orthogonal (the own-square case is excluded below).
      const oneStep = (air ? nearbySquaresW(ctx.state, ally.x, ally.y) : orthAdjacentWrapped(ctx.state, ally.x, ally.y)).some((s) => s.x === sq?.x && s.y === sq?.y)
      if (sq && (sq.x !== ally.x || sq.y !== ally.y) && oneStep) {
        ctx.teleport(ally.id, sq.x, sq.y, ally.region)
        path.push({ x: sq.x, y: sq.y })
        if ((c.n as number) < 1) return whirlStep(ctx, ally.id, path, (c.n as number) + 1)
      }
      // strike each enemy along the visited squares ONCE — FAQ: "an enemy is either along
      // your path or not; they will not be struck more than once." So stepping forward and
      // back over the same square does NOT double-strike an enemy there. Dedupe by unit id.
      const seen = new Set<string>()
      for (const p of path) {
        for (const u of unitsAt(ctx.state, p.x, p.y, ally.region)) {
          if (u.controller !== ally.controller) seen.add(u.id)
        }
      }
      // the strikes resolve one at a time and the ORDER can matter (a kill may cut off a
      // trigger), so the controller chooses it — shared with every other multi-strike effect.
      strikeAllSimultaneous(ctx.state, ally.id, [...seen], ctx.controller)
    },
  },
})

function whirlStep(ctx: EffectAPI, unitId: string, path: { x: number; y: number }[], n: number): void {
  const ally = ctx.state.units[unitId]
  if (!ally) return
  if (path.length === 1) path[0] = { x: ally.x, y: ally.y }
  const from = { x: ally.x, y: ally.y, region: ally.region }
  // airborne allies may step diagonally (8 neighbours), grounded ones orthogonally (4)
  const air = !!effKeywords(ctx.state, ally).airborne
  const cands = air ? nearbySquaresW(ctx.state, ally.x, ally.y).filter((s) => !(s.x === ally.x && s.y === ally.y)) : orthAdjacentWrapped(ctx.state, ally.x, ally.y)
  const squares = cands.filter((s) => isLegalStep(ctx.state, ally, from, { x: s.x, y: s.y, region: ally.region }))
  ctx.ask(
    { kind: 'chooseSquare', title: `Whirling Blades: step ${n + 1} of 2 (own square to stop)`, data: { squares: [...squares, { x: ally.x, y: ally.y }] } },
    'whirl',
    { unitId, path, n },
  )
}
