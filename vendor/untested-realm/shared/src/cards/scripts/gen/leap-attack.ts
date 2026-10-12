import { registerScript } from '../registry'
import { strikeAllSimultaneous } from '../../../engine/effects'
import { orthAdjacentWrapped, unitsAt } from '../../../engine/grid'
import { isLegalStep } from '../../../engine/movement'

// 'An ally may take a step, and then it strikes each enemy at its location.'
registerScript('Leap Attack', {
  // "an ally" — not "an allied minion" — so it works with your Avatar too
  targets: [{ what: 'unit', count: 1, targeted: false, owner: 'ally', label: 'an ally' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('unit' in t)) return
    const ally = ctx.state.units[t.unit]
    if (!ally) return
    const from = { x: ally.x, y: ally.y, region: ally.region }
    const squares = orthAdjacentWrapped(ctx.state, ally.x, ally.y).filter((s) => isLegalStep(ctx.state, ally, from, { ...s, region: ally.region }))
    if (!squares.length) return leapStrike(ctx, ally.id)
    ctx.ask({ kind: 'chooseSquare', title: `${ally.name} leaps where? (its own square to stay)`, data: { squares: [...squares, { x: ally.x, y: ally.y }] } }, 'leap', { unitId: ally.id })
  },
  conts: {
    leap: (ctx, c, sq) => {
      const ally = ctx.state.units[c.unitId as string]
      if (!ally) return
      if (sq && (sq.x !== ally.x || sq.y !== ally.y) && orthAdjacentWrapped(ctx.state, ally.x, ally.y).some((s) => s.x === sq.x && s.y === sq.y)) {
        ctx.teleport(ally.id, sq.x, sq.y, ally.region)
      }
      leapStrike(ctx, ally.id)
    },
  },
})

function leapStrike(ctx: any, unitId: string): void {
  const ally = ctx.state.units[unitId]
  if (!ally) return
  const foes = unitsAt(ctx.state, ally.x, ally.y, ally.region).filter((u: any) => u.controller !== ally.controller).map((u: any) => u.id)
  strikeAllSimultaneous(ctx.state, ally.id, foes, ctx.controller) // controller chooses strike order
}
