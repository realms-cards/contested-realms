import { registerScript } from '../registry'
import { getCard } from '../../db'
import { orthAdjacentWrapped } from '../../../engine/grid'

// 'Units here have "Tap → Destroy target adjacent Wall or Monument."'
registerScript('Battering Ram', {
  artifactGrantsAbilities: (state, artifactId, unit) => {
    const art = state.artifacts[artifactId]
    if (!art || unit.x !== art.x || unit.y !== art.y || unit.region !== art.region) return []
    return [{
      key: 'batteringram:smash',
      label: 'Battering Ram: destroy adjacent Wall or Monument',
      cost: { tap: true },
      targets: [{
        what: 'site', count: 1, targeted: true, label: 'adjacent Wall or Monument',
        filter: (st, s, source) => {
          if (!orthAdjacentWrapped(st, source.x, source.y).some((sq) => sq.x === s.x && sq.y === s.y)) return false
          const subtypes = getCard(s.name).subtypes
          return subtypes.includes('Wall') || subtypes.includes('Monument')
        },
      }],
      effect: (ctx) => {
        const t = ctx.targets[0]
        if (t && 'site' in t) ctx.destroySite(t.site)
      },
    }]
  },
})
