import { registerScript } from '../registry'

// "Burrowing / Allies can't enter this site."
registerScript('Undesirables', {
  unitEntryFilter: (state, selfId, mover, _from, to) => {
    const self = state.units[selfId]
    if (!self) return true
    if (mover.controller !== self.controller) return true
    return !(to.x === self.x && to.y === self.y)
  },
})
