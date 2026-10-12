import { registerScript } from '../registry'

// "Minions occupying nearby sites can't submerge or surface."
registerScript('Iceberg', {
  entryFilter: (state, selfId, unit, from, to) => {
    const site = state.sites[selfId]
    if (!site || unit.isAvatar) return true
    const near = Math.abs(from.x - site.x) <= 1 && Math.abs(from.y - site.y) <= 1
    if (!near) return true
    const vertical = from.x === to.x && from.y === to.y && from.region !== to.region
    const wet = from.region === 'underwater' || to.region === 'underwater'
    return !(vertical && wet)
  },
})
