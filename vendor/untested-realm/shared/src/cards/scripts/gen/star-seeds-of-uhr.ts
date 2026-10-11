import { registerScript, type EffectAPI } from '../registry'
import { GRID_H, GRID_W, inBounds, siteAt } from '../../../engine/grid'
import type { GameState } from '../../../engine/types'

/** every empty (site-less) square — a void */
function allVoids(state: GameState): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) if (!siteAt(state, x, y)) out.push({ x, y })
  return out
}

// 'Fill up to thirteen voids with Rubble.'
registerScript('Star-seeds of Uhr', {
  onCast: (ctx) => seedNext(ctx, 0),
  conts: {
    seed: (ctx, c, sq) => {
      if (sq && inBounds(sq.x, sq.y) && !siteAt(ctx.state, sq.x, sq.y)) {
        const rubbleCardId = `c${ctx.state.nextId++}`
        ctx.state.cards[rubbleCardId] = { id: rubbleCardId, name: 'Rubble', owner: ctx.controller, isToken: true }
        const rubbleId = `s${ctx.state.nextId++}`
        ctx.state.sites[rubbleId] = {
          id: rubbleId, cardId: rubbleCardId, name: 'Rubble', owner: ctx.controller,
          controller: null, x: sq.x, y: sq.y, tapped: false, isRubble: true,
        }
      }
      seedNext(ctx, (c.n as number) + 1)
    },
    more: (ctx, c, yes) => {
      if (yes) askSeed(ctx, c.n as number)
    },
  },
})

function seedNext(ctx: EffectAPI, n: number): void {
  if (n >= 13) return
  const voids = allVoids(ctx.state)
  if (!voids.length) return
  ctx.ask({ kind: 'yesNo', title: `Star-seeds: fill another void with Rubble? (${n}/13 placed)` }, 'more', { n })
}

function askSeed(ctx: EffectAPI, n: number): void {
  const voids = allVoids(ctx.state)
  if (!voids.length) return
  ctx.ask({ kind: 'chooseSquare', title: 'Seed which void?', data: { squares: voids } }, 'seed', { n })
}
