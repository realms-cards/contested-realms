import { registerScript } from '../registry'
import { occupiedSquares } from '../../../engine/grid'
import { terrainAt, footprintAllTerrain } from '../../../engine/statics'
import { pushLog, checkStateBased } from '../../../engine/effects'
import { syncCarried } from '../../../engine/carrying'

// 'Submerge target minion or artifact, if able.'
registerScript('Drown', {
  targets: [{ what: 'minionOrArtifact', count: 1, targeted: true, label: 'target minion or artifact' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    // "Submerge target minion OR artifact." A carried artifact drags its BEARER under with it —
    // except an Avatar can never enter the subsurface, so then only the artifact submerges (detached).
    if ('artifact' in t) {
      const a = ctx.state.artifacts[t.artifact]
      if (!a) return
      const bearer = a.carriedBy ? ctx.state.units[a.carriedBy] : null
      const bx = bearer ? bearer.x : a.x, by = bearer ? bearer.y : a.y
      if (terrainAt(ctx.state, bx, by) !== 'water') return ctx.log('No underwater there.')
      if (bearer && !bearer.isAvatar) {
        if (!footprintAllTerrain(ctx.state, bearer, 'water'))
          return ctx.log(`${bearer.name} straddles more than water -- it can't be submerged.`)
        bearer.region = 'underwater'
        syncCarried(ctx.state, bearer) // the carried artifact rides down with it
        pushLog(ctx.state, ctx.controller, `${bearer.name} is dragged below!`)
      } else {
        if (bearer) { bearer.carrying = bearer.carrying.filter((id) => id !== a.id); a.carriedBy = null; a.x = bearer.x; a.y = bearer.y }
        a.region = 'underwater'
        pushLog(ctx.state, ctx.controller, `${a.name} is dragged below!`)
      }
      return checkStateBased(ctx.state)
    }
    if (!('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    // Oversized units submerge only if their WHOLE footprint is water (rulebook).
    if (!footprintAllTerrain(ctx.state, u, 'water'))
      return ctx.log(occupiedSquares(u).length > 1 ? `${u.name} straddles more than water -- it can't be submerged.` : 'No underwater there.')
    u.region = 'underwater'
    pushLog(ctx.state, ctx.controller, `${u.name} is dragged below!`)
    checkStateBased(ctx.state)
  },
})
