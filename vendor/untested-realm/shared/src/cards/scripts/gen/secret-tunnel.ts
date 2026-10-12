import { registerScript } from '../registry'
import { terrainAt } from '../../../engine/statics'

// 'Burrowed allies can move as if this were adjacent to your other sites.'
registerScript('Secret Tunnel', {
  extraSteps: (state, unit, from, selfId) => {
    if (unit.region !== 'underground' || from.region !== 'underground') return []
    const tunnel = state.sites[selfId] // THIS tunnel; it serves its own controller's burrowed allies
    if (!tunnel || tunnel.controller !== unit.controller || terrainAt(state, tunnel.x, tunnel.y) !== 'land') return []
    const out = []
    // from any of your sites' undergrounds → the tunnel, and vice versa
    const fromSite = Object.values(state.sites).find((s) => s.x === from.x && s.y === from.y)
    if (fromSite?.controller === unit.controller && !(from.x === tunnel.x && from.y === tunnel.y)) {
      out.push({ x: tunnel.x, y: tunnel.y, region: 'underground' as const })
    }
    if (from.x === tunnel.x && from.y === tunnel.y) {
      for (const s of Object.values(state.sites)) {
        if (s.controller === unit.controller && s.id !== tunnel.id && terrainAt(state, s.x, s.y) === 'land') {
          out.push({ x: s.x, y: s.y, region: 'underground' as const })
        }
      }
    }
    return out
  },
})
