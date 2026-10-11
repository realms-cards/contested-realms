import { registerScript } from '../registry'
import { adjacentSquaresW, siteAt } from '../../../engine/grid'
import { terrainAt } from '../../../engine/statics'

// "Submerge target minion, or pull it into a void it's adjacent to."
registerScript('Into the Abyss', {
  targets: [{ what: 'minion', count: 1, targeted: true, label: 'target minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    const canSubmerge = terrainAt(ctx.state, u.x, u.y) === 'water'
    const voidAdj = adjacentSquaresW(ctx.state, u.x, u.y).find((s) => !siteAt(ctx.state, s.x, s.y) && !(s.x === u.x && s.y === u.y))
    const options = [...(canSubmerge ? ['submerge it'] : []), ...(voidAdj ? ['pull into the void'] : [])]
    if (!options.length) return ctx.log('No abyss to send it to.')
    ctx.ask({ kind: 'chooseOption', title: 'Into the Abyss:', data: { options } }, 'abyss', { unitId: u.id, voidAdj })
  },
  conts: {
    abyss: (ctx, contCtx, choice) => {
      const u = ctx.state.units[contCtx.unitId]
      if (!u) return
      // both are FORCED moves — route through teleport(push) so they fire on-enter triggers and honour
      // move-protection/Cage, and the void pull uses `intoVoid` (a non-Voidwalk victim is then lost).
      if (choice === 'submerge it') {
        ctx.teleport(u.id, u.x, u.y, 'underwater', { push: true })
      } else if (contCtx.voidAdj) {
        const v = contCtx.voidAdj as { x: number; y: number }
        ctx.teleport(u.id, v.x, v.y, 'void', { push: true, intoVoid: true })
      }
    },
  },
})
