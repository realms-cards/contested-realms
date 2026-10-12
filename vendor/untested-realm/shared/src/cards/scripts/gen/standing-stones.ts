import { registerScript } from '../registry'

// 'Minions here are Spellcasters.'
// A site's "here" is BOTH its surface and its subsurface location — a burrowed/submerged
// minion at this site is also a Spellcaster (no region gate).
registerScript('Standing Stones', {
  siteGrantsKeywords: (state, site, unit) => {
    if (!unit.isAvatar && unit.x === site.x && unit.y === site.y) return ['spellcaster']
    return []
  },
})
