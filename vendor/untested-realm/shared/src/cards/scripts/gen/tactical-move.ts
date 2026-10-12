import { registerScript, type EffectAPI } from '../registry'
import { orthAdjacentWrapped } from '../../../engine/grid'
import { isLegalStep } from '../../../engine/movement'

// 'One at a time, each ally takes up to two steps.'
registerScript('Tactical Move', {
  onCast: (ctx) => marchNext(ctx, [], 0),
  conts: {
    march: (ctx, c, sq) => {
      const u = ctx.state.units[c.unitId as string]
      if (u && sq && (sq.x !== u.x || sq.y !== u.y) && orthAdjacentWrapped(ctx.state, u.x, u.y).some((s) => s.x === sq.x && s.y === sq.y)) {
        ctx.teleport(u.id, sq.x, sq.y, u.region)
        if ((c.step as number) < 1) return marchStep(ctx, u.id, c.done as string[], (c.step as number) + 1)
      }
      marchNext(ctx, [...(c.done as string[]), c.unitId as string], 0)
    },
  },
})

function marchNext(ctx: EffectAPI, done: string[], _n: number): void {
  const next = Object.values(ctx.state.units).find((u) => u.controller === ctx.controller && !u.isAvatar && !done.includes(u.id))
  if (!next) return
  marchStep(ctx, next.id, done, 0)
}

function marchStep(ctx: EffectAPI, unitId: string, done: string[], step: number): void {
  const u = ctx.state.units[unitId]
  if (!u) return marchNext(ctx, [...done, unitId], 0)
  const from = { x: u.x, y: u.y, region: u.region }
  const squares = orthAdjacentWrapped(ctx.state, u.x, u.y).filter((s) => isLegalStep(ctx.state, u, from, { ...s, region: u.region }))
  if (!squares.length) return marchNext(ctx, [...done, unitId], 0)
  ctx.ask(
    { kind: 'chooseSquare', title: `Tactical Move: ${u.name}, step ${step + 1}/2 (own square to hold position)`, data: { squares: [...squares, { x: u.x, y: u.y }] } },
    'march',
    { unitId, done, step },
  )
}
