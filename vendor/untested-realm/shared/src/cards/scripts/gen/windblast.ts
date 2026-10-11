import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { inBounds, siteAt } from '../../../engine/grid'

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
      // move far-side first so pushes don't collide with un-moved pieces
      const units = Object.values(ctx.state.units)
        .filter((u) => u.region === 'surface' && siteAt(ctx.state, u.x, u.y))
        .sort((a, b) => (b.x * dx + b.y * dy) - (a.x * dx + a.y * dy))
      for (const u of units) {
        const nx = u.x + dx
        const ny = u.y + dy
        if (inBounds(nx, ny) && siteAt(ctx.state, nx, ny)) ctx.teleport(u.id, nx, ny, 'surface', { push: true }) // "push one step" — forced push
      }
      for (const a of Object.values(ctx.state.artifacts)) {
        if (a.carriedBy || a.region !== 'surface' || !siteAt(ctx.state, a.x, a.y)) continue
        const nx = a.x + dx
        const ny = a.y + dy
        if (inBounds(nx, ny) && siteAt(ctx.state, nx, ny)) {
          a.x = nx
          a.y = ny
        }
      }
      pushLog(ctx.state, ctx.controller, 'Everything is blown a step downwind!')
    },
  },
})
