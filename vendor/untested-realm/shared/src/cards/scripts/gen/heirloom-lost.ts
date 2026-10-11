import { registerScript } from '../registry'
import { siteRarity } from '../../../engine/statics'

// "You may play this to replace any player's Elite or Unique site, under their control."
registerScript('Heirloom Lost', {
  mayReplaceSite: (state, _player, site) => {
    const real = state.sites[site.id] // the hook gets a projected site; read rarity off the real one
    const r = real ? siteRarity(state, real) : 'Ordinary' // rubble is Ordinary → not an Elite/Unique heirloom
    return r === 'Elite' || r === 'Unique'
  },
  replacedSiteIsBanished: true, // FAQ: the replaced site is banished
})
