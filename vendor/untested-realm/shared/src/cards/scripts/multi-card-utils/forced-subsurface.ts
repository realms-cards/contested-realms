import { type CardScript } from '../registry'
import { occupiedSquares } from '../../../engine/grid'
import { terrainAt, footprintAllTerrain } from '../../../engine/statics'
import { pushLog, checkStateBased } from '../../../engine/effects'
import { syncCarried } from '../../../engine/carrying'

// Bury (land → underground) / Drown (water → underwater): force a minion or artifact into the matching
// subsurface, if able. A carried artifact drags its BEARER under with it — except an Avatar can never
// enter the subsurface, so then only the artifact goes under (detached). An oversized unit submerges only
// if its WHOLE footprint is the right terrain (rulebook: a forced burrow/submerge fails on a straddler).
export function forcedSubsurface(terrain: 'land' | 'water'): CardScript {
  const water = terrain === 'water'
  const region = water ? 'underwater' : 'underground'
  const noneMsg = water ? 'No underwater there.' : 'No underground there.'
  const straddleMsg = (name: string) => water
    ? `${name} straddles more than water -- it can't be submerged.`
    : `${name} straddles more than land -- it can't be buried.`
  const sunkMsg = (name: string) => (water ? `${name} is dragged below!` : `${name} is buried!`)
  return {
    targets: [{ what: 'minionOrArtifact', count: 1, targeted: true, label: 'target minion or artifact' }],
    onCast: (ctx) => {
      const t = ctx.targets[0]
      if ('artifact' in t) {
        const a = ctx.state.artifacts[t.artifact]
        if (!a) return
        const bearer = a.carriedBy ? ctx.state.units[a.carriedBy] : null
        const bx = bearer ? bearer.x : a.x, by = bearer ? bearer.y : a.y
        if (terrainAt(ctx.state, bx, by) !== terrain) return ctx.log(noneMsg)
        if (bearer && !bearer.isAvatar) {
          if (!footprintAllTerrain(ctx.state, bearer, terrain)) return ctx.log(straddleMsg(bearer.name))
          bearer.region = region
          syncCarried(ctx.state, bearer) // the carried artifact rides down with it
          pushLog(ctx.state, ctx.controller, sunkMsg(bearer.name))
        } else {
          if (bearer) { bearer.carrying = bearer.carrying.filter((id) => id !== a.id); a.carriedBy = null; a.x = bearer.x; a.y = bearer.y }
          a.region = region
          pushLog(ctx.state, ctx.controller, sunkMsg(a.name))
        }
        return checkStateBased(ctx.state)
      }
      if (!('unit' in t)) return
      const u = ctx.state.units[t.unit]
      if (!u) return
      if (!footprintAllTerrain(ctx.state, u, terrain))
        return ctx.log(occupiedSquares(u).length > 1 ? straddleMsg(u.name) : noneMsg)
      u.region = region
      syncCarried(ctx.state, u) // carried artifacts/units are dragged down along with the bearer
      pushLog(ctx.state, ctx.controller, sunkMsg(u.name))
      checkStateBased(ctx.state)
    },
  }
}
