import { registerScript } from '../registry'
import { pushLog, loseLife } from '../../../engine/effects'
import { siteAt, occupiedSquares, inBounds } from '../../../engine/grid'
import { ORTH } from '../multi-card-utils/orth'

// --------------------------------------------------------------- The Rack ----
// 'Whenever the bearer strikes an Avatar, stretch them so that they also occupy
//  another adjacent location. Then they lose 1 life for each location they occupy.'
registerScript('The Rack', {
  bearerOnStrike: (ctx, _artifactId, target) => {
    if (!target.isAvatar) return
    const taken = occupiedSquares(target)
    const options: { x: number; y: number }[] = []
    for (const part of taken) {
      for (const [dx, dy] of ORTH) {
        const x = part.x + dx
        const y = part.y + dy
        // stretch only onto real LOCATIONS (a site) — never the void: an avatar can't exist there
        if (!inBounds(x, y) || !siteAt(ctx.state, x, y) || taken.some((s) => s.x === x && s.y === y)) continue
        if (!options.some((s) => s.x === x && s.y === y)) options.push({ x, y })
      }
    }
    if (!options.length) {
      loseLife(ctx.state, target.controller, occupiedSquares(target).length)
      return
    }
    ctx.ask({ kind: 'chooseSquare', title: `The Rack stretches ${target.name} onto which location?`, data: { squares: options } }, 'stretch', { victimId: target.id, options })
  },
  conts: {
    stretch: (ctx, c, choice) => {
      const victim = ctx.state.units[c.victimId as string]
      if (!victim) return
      const sq = choice as { x: number; y: number }
      const options = c.options as { x: number; y: number }[]
      if (sq && options.some((o) => o.x === sq.x && o.y === sq.y)) {
        victim.extraSquares = [...(victim.extraSquares ?? []), { x: sq.x, y: sq.y, region: victim.region }]
        pushLog(ctx.state, ctx.controller, `${victim.name} is stretched across ${occupiedSquares(victim).length} locations!`)
      }
      loseLife(ctx.state, victim.controller, occupiedSquares(victim).length)
    },
  },
})
