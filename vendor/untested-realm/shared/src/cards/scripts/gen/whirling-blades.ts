import { registerScript, type EffectAPI } from '../registry'
import { strikeAllSimultaneous } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'
import { legalStepsFrom } from '../../../engine/movement'
import type { Region } from '../../../engine/types'

type Visited = { x: number; y: number; region: Region }

// 'An ally may take up to two steps, and then strikes each enemy along their entire path.'
registerScript('Whirling Blades', {
  // "an ally" (not "an allied minion") — so it may target your Avatar too
  targets: [{ what: 'unit', count: 1, targeted: false, owner: 'ally', label: 'an ally' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('unit' in t)) return
    whirlStep(ctx, t.unit, [], 0)
  },
  conts: {
    whirl: (ctx, c, sq) => {
      const ally = ctx.state.units[c.unitId as string]
      if (!ally) return
      const path = c.path as Visited[]
      if (!path.length) path.push({ x: ally.x, y: ally.y, region: ally.region }) // record the start square
      // These are real STEPS (not a forced same-region teleport): a Voidwalk ally in the void may step to
      // the surface, an Airborne one steps diagonally, a Burrower/Submerger changes level — legalStepsFrom
      // enumerates exactly those, so we honour whatever region the chosen step lands in.
      const from = { x: ally.x, y: ally.y, region: ally.region }
      const chosen = sq ? legalStepsFrom(ctx.state, ally, from).find((s) => s.x === sq.x && s.y === sq.y && (sq.region == null || s.region === sq.region)) : undefined
      if (chosen) {
        ctx.teleport(ally.id, chosen.x, chosen.y, chosen.region) // the step lands in the chosen step's region
        path.push({ x: chosen.x, y: chosen.y, region: chosen.region })
        if ((c.n as number) < 1) return whirlStep(ctx, ally.id, path, (c.n as number) + 1)
      }
      // strike each enemy along the visited squares ONCE — FAQ: "an enemy is either along your path or not;
      // they will not be struck more than once." Dedupe by unit id; each path square keeps its own region, so
      // an ally that dipped into the void/underwater only strikes what was actually there.
      const seen = new Set<string>()
      for (const p of path) {
        for (const u of unitsAt(ctx.state, p.x, p.y, p.region)) {
          if (u.controller !== ally.controller) seen.add(u.id)
        }
      }
      // the strikes resolve one at a time and the ORDER can matter (a kill may cut off a
      // trigger), so the controller chooses it — shared with every other multi-strike effect.
      strikeAllSimultaneous(ctx.state, ally.id, [...seen], ctx.controller)
    },
  },
})

function whirlStep(ctx: EffectAPI, unitId: string, path: Visited[], n: number): void {
  const ally = ctx.state.units[unitId]
  if (!ally) return
  const from = { x: ally.x, y: ally.y, region: ally.region }
  // every legal single step (Voidwalk/Airborne/Burrowing/Submerge region changes included), plus "stay here"
  const steps = legalStepsFrom(ctx.state, ally, from)
  ctx.ask(
    { kind: 'chooseSquare', title: `Whirling Blades: step ${n + 1} of 2 (own square to stop)`, data: { squares: [...steps, { x: ally.x, y: ally.y, region: ally.region }] } },
    'whirl',
    { unitId, path, n },
  )
}
