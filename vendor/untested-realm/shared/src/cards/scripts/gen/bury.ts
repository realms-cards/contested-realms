import { registerScript } from '../registry'
import { occupiedSquares } from '../../../engine/grid'
import { terrainAt, footprintAllTerrain } from '../../../engine/statics'
import { pushLog, checkStateBased } from '../../../engine/effects'
import { syncCarried } from '../../../engine/carrying'

// 'Burrow target minion or artifact, if able.'
registerScript('Bury', {
  targets: [{ what: 'minionOrArtifact', count: 1, targeted: true, label: 'target minion or artifact' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    // "Burrow target minion OR artifact." A carried artifact drags its BEARER underground with it —
    // except an Avatar can never enter the subsurface, so then only the artifact is buried (detached).
    if ('artifact' in t) {
      const a = ctx.state.artifacts[t.artifact]
      if (!a) return
      const bearer = a.carriedBy ? ctx.state.units[a.carriedBy] : null
      const bx = bearer ? bearer.x : a.x, by = bearer ? bearer.y : a.y
      if (terrainAt(ctx.state, bx, by) !== 'land') return ctx.log('No underground there.')
      if (bearer && !bearer.isAvatar) {
        if (!footprintAllTerrain(ctx.state, bearer, 'land'))
          return ctx.log(`${bearer.name} straddles more than land -- it can't be buried.`)
        bearer.region = 'underground'
        syncCarried(ctx.state, bearer) // the carried artifact rides down with it
        pushLog(ctx.state, ctx.controller, `${bearer.name} is buried!`)
      } else {
        if (bearer) { bearer.carrying = bearer.carrying.filter((id) => id !== a.id); a.carriedBy = null; a.x = bearer.x; a.y = bearer.y }
        a.region = 'underground'
        pushLog(ctx.state, ctx.controller, `${a.name} is buried!`)
      }
      return checkStateBased(ctx.state)
    }
    if (!('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    // An oversized unit can only be buried if its WHOLE footprint is land (rulebook:
    // a forced burrow/submerge fails unless the oversized unit occupies one terrain).
    if (!footprintAllTerrain(ctx.state, u, 'land'))
      return ctx.log(occupiedSquares(u).length > 1 ? `${u.name} straddles more than land -- it can't be buried.` : 'No underground there.')
    u.region = 'underground'
    syncCarried(ctx.state, u) // carried artifacts/units are buried along with the bearer
    pushLog(ctx.state, ctx.controller, `${u.name} is buried!`)
    checkStateBased(ctx.state)
  },
})
