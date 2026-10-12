import { registerScript } from '../registry'

// 'Your Beasts are Monsters, your Mortals are Undead, and your Angels are Demons.'
// (avatar; the Tap → Play or draw a site ability is the standard avatar action)
registerScript('Corruptor', {
  subtypeOverride: (state, selfId, unit, st) => {
    const self = state.units[selfId]
    if (!self || unit.controller !== self.controller) return st
    // FAQ: the corrupted type is ADDED — a Mortal is Undead AND Mortal
    const extra: string[] = []
    if (st.includes('Beast') && !st.includes('Monster')) extra.push('Monster')
    if (st.includes('Mortal') && !st.includes('Undead')) extra.push('Undead')
    if (st.includes('Angel') && !st.includes('Demon')) extra.push('Demon')
    return extra.length ? [...st, ...extra] : st
  },
})
