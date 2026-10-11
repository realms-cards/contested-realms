import { registerScript } from '../registry'
import { isSiteEmpty } from '../../../engine/grid'

// 'Provides no mana or threshold unless completely empty.'
// "completely empty" = no units (any region, incl. a face-down card), no ground artifact, no aura.
registerScript('Pristine Paradise', {
  siteProvides: (state, site) => isSiteEmpty(state, site.x, site.y),
})
