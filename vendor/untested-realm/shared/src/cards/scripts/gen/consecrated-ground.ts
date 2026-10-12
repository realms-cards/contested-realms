import { registerScript } from '../registry'
import { getCard } from '../../db'
import { isEvilU } from '../multi-card-utils/is-evil-u'

// 'Evil has no power here.' (their power is reduced to 0 on this site)
registerScript('Consecrated Ground', {
  siteGrantsPower: (state, site, unit) => {
    if (unit.x !== site.x || unit.y !== site.y || unit.isAvatar || !isEvilU(state, unit)) return 0
    // cancel out the printed power (modifiers on top still apply — the ground
    // suppresses their nature, not blessings placed upon them)
    const def = getCard(unit.name)
    return -(def.attack ?? 0)
  },
})
