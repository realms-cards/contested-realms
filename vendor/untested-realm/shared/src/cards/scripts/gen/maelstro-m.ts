import { registerScript, type EffectAPI } from '../registry'
import { pushLog } from '../../../engine/effects'
import { orthAdjacentWrapped, unitsAt } from '../../../engine/grid'
import { stepDistance } from '../../../engine/movement'
import { waterBody } from '../multi-card-utils/water-body'

// 'At the start of your turn, you may pull in each minion in this body of water one step.'
registerScript('Maelström', {
  startOfTurn: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    ctx.ask({ kind: 'yesNo', title: 'Let the Maelström pull everything in?' }, 'spin')
  },
  conts: {
    spin: (ctx, _c, yes) => {
      if (yes) maelstromNext(ctx, [])
    },
    maelstromStep: (ctx, c, sq) => {
      const u = ctx.state.units[c.unitId as string]
      if (u && sq) ctx.teleport(u.id, sq.x, sq.y, u.region, { push: true }) // forced pull
      maelstromNext(ctx, [...(c.done as string[]), c.unitId as string])
    },
  },
})

// Pull each minion in the body one step toward the maw. "Pull ... one step" is forced
// movement (def. 1): orthogonal, Manhattan, staying within this body of water. The
// Maelström's OWNER (whose turn it is) pulls EVERY minion — their own and the opponent's —
// so where TWO squares both draw a minion closer, THEY choose the direction; the opponent
// is never prompted. Resolved one minion at a time so each tie is a real prompt, never [0].
function maelstromNext(ctx: EffectAPI, done: string[]): void {
  const self = ctx.state.sites[ctx.sourceId]
  if (!self) return
  const body = waterBody(ctx.state, self.x, self.y)
  const prey = body
    .flatMap((s) => unitsAt(ctx.state, s.x, s.y))
    .find((u) => !u.isAvatar && !done.includes(u.id) && !(u.x === self.x && u.y === self.y))
  if (!prey) {
    pushLog(ctx.state, ctx.controller, 'The Maelström drags everything toward its maw.')
    return
  }
  const steps = orthAdjacentWrapped(ctx.state, prey.x, prey.y).filter(
    (s) => body.some((b) => b.x === s.x && b.y === s.y) && stepDistance(s, self) < stepDistance(prey, self),
  )
  if (steps.length === 0) return maelstromNext(ctx, [...done, prey.id])
  if (steps.length === 1) {
    ctx.teleport(prey.id, steps[0].x, steps[0].y, prey.region, { push: true }) // forced pull
    return maelstromNext(ctx, [...done, prey.id])
  }
  ctx.ask(
    { kind: 'chooseSquare', title: `The Maelström drags ${prey.name} — which way?`, data: { squares: steps.map((s) => ({ x: s.x, y: s.y })) }, player: ctx.controller },
    'maelstromStep',
    { unitId: prey.id, done },
  )
}
