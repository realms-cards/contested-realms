import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'

// 'May be cast under any site. / Burrowing, Submerge'
registerScript('Sewer Rats', {
  summonAnywhere: true,
  summonFilter: (state, player, at) => {
    const region = (at as any).region ?? 'surface'
    if (region === 'underground' || region === 'underwater') return null // under ANY site
    const site = siteAt(state, at.x, at.y)
    return site && site.controller === player ? null : 'Sewer Rats surface only on your own sites.'
  },
})
