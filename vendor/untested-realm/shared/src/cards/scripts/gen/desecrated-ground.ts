import { registerScript } from '../registry'
import { isEvilU } from '../multi-card-utils/is-evil-u'

// 'Evil units here have +1 power.'
registerScript('Desecrated Ground', {
  siteGrantsPower: (state, site, unit) =>
    unit.x === site.x && unit.y === site.y && !unit.isAvatar && isEvilU(state, unit) ? 1 : 0,
})
