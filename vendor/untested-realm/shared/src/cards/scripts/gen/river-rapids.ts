import { registerScript } from '../registry'
import { getCard } from '../../db'
import { orthAdjacentWrapped, siteAt, unitsAt } from '../../../engine/grid'
import type { GameState } from '../../../engine/types'

// 'Once on your turn, you may push a minion on connected Rivers one step.'
registerScript('River Rapids', {
  abilities: [{
    key: 'rapids',
    label: 'Push a minion along the Rivers',
    cost: {},
    oncePerTurn: true,
    effect: (ctx) => {
      const self = ctx.state.sites[ctx.sourceId]
      if (!self) return
      const rivers = riverChain(ctx.state, self.x, self.y)
      const boaters = rivers.flatMap((s) => unitsAt(ctx.state, s.x, s.y)).filter((u) => !u.isAvatar).map((u) => u.id)
      if (!boaters.length) return ctx.log('No minion rides the Rivers.')
      // "push a minion" is NOT targeting — a warded minion can still be pushed and keeps its ward.
      ctx.ask({ kind: 'chooseTargets', title: 'The rapids push whom?', data: { candidates: boaters, count: 1, upTo: false, kind: 'unit', notTargeted: true } }, 'seize', { rivers })
    },
  }],
  conts: {
    seize: (ctx, c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const u = typeof id === 'string' ? ctx.state.units[id] : null
      if (!u) return
      const steps = orthAdjacentWrapped(ctx.state, u.x, u.y).filter((s) => siteAt(ctx.state, s.x, s.y))
      if (!steps.length) return
      ctx.ask({ kind: 'chooseSquare', title: `${u.name} is swept where?`, data: { squares: steps } }, 'sweep', { unitId: u.id })
    },
    sweep: (ctx, c, sq) => {
      const u = ctx.state.units[c.unitId as string]
      if (u && sq) ctx.teleport(u.id, sq.x, sq.y, u.region, { push: true }) // a current/push, not a Teleport (Cage of Sidrak)
    },
  },
})

function riverChain(state: GameState, x: number, y: number): { x: number; y: number }[] {
  const isRiver = (sx: number, sy: number) => {
    const s = siteAt(state, sx, sy)
    return !!s && (/river|rapids/i.test(s.name) || getCard(s.name).subtypes.includes('River'))
  }
  const seen = new Set([`${x},${y}`])
  const queue = [{ x, y }]
  const out: { x: number; y: number }[] = []
  while (queue.length) {
    const cur = queue.shift()!
    out.push(cur)
    for (const n of orthAdjacentWrapped(state, cur.x, cur.y)) {
      const key = `${n.x},${n.y}`
      if (!seen.has(key) && isRiver(n.x, n.y)) {
        seen.add(key)
        queue.push(n)
      }
    }
  }
  return out
}
