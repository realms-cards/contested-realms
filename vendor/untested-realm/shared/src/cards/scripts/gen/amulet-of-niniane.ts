import { registerScript } from '../registry'

// "Bearer can't be targeted or damaged by magic." (artifact)
registerScript('Amulet of Niniane', {
  magicProtected: (state, selfId, unit) => {
    const art = state.artifacts[selfId]
    return !!art && art.carriedBy === unit.id
  },
})
