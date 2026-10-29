import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { GRID_H, GRID_W, edgesConnected, inBounds, siteAt } from '../../../engine/grid'
import { isCarriableArtifact } from '../../../engine/statics'

// 'Push everything atop sites one step in a cardinal direction.'
registerScript('Windblast', {
  onCast: (ctx) => {
    ctx.ask({ kind: 'chooseOption', title: 'The wind howls in which direction?', data: { options: ['north', 'south', 'east', 'west'] } }, 'gust')
  },
  conts: {
    gust: (ctx, _c, choice) => {
      if (typeof choice !== 'string') return
      const dx = choice === 'east' ? 1 : choice === 'west' ? -1 : 0
      const dy = choice === 'north' ? 1 : choice === 'south' ? -1 : 0
      // one step from where it stood (Magellan Globe connects the edges); a push never reaches the void
      const wrap = edgesConnected(ctx.state)
      const stepFrom = (x: number, y: number): { x: number; y: number } | null => {
        let nx = x + dx
        let ny = y + dy
        if (!inBounds(nx, ny)) {
          if (!wrap) return null
          nx = (nx + GRID_W) % GRID_W
          ny = (ny + GRID_H) % GRID_H
        }
        return siteAt(ctx.state, nx, ny) ? { x: nx, y: ny } : null
      }
      // "all the steps are simultaneously resolved" (FAQ): every destination is fixed before anything
      // moves, and carriers go first, so a carried unit its carrier brought along isn't blown a second step
      const unitMoves = Object.values(ctx.state.units)
        .filter((u) => u.region === 'surface' && siteAt(ctx.state, u.x, u.y))
        .sort((a, b) => Number(!!a.carriedBy) - Number(!!b.carriedBy))
        .map((u) => ({ id: u.id, to: stepFrom(u.x, u.y) }))
      // carried artifacts ride their bearers; a Monument never moves (Automatons are units, pushed above)
      const artMoves = Object.values(ctx.state.artifacts)
        .filter((a) => !a.carriedBy && a.region === 'surface' && siteAt(ctx.state, a.x, a.y) && isCarriableArtifact(a.name))
        .map((a) => ({ id: a.id, to: stepFrom(a.x, a.y) }))
      for (const m of unitMoves) {
        if (m.to) ctx.teleport(m.id, m.to.x, m.to.y, 'surface', { push: true }) // "push one step" — forced push
      }
      for (const m of artMoves) {
        const a = ctx.state.artifacts[m.id]
        if (a && m.to && !a.carriedBy) { a.x = m.to.x; a.y = m.to.y }
      }
      pushLog(ctx.state, ctx.controller, 'Everything is blown a step downwind!')
    },
  },
})
