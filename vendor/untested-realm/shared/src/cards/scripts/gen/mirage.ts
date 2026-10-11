import { registerScript } from '../registry'

// 'When played, you may return a site in play you own to your hand to play this
// site in its place.'
registerScript('Mirage', {
  mayReplaceOwnSite: true,
})
