import { registerScript } from '../registry'
import { summonIfNoEnemies } from '../multi-card-utils/summon-if-no-enemies'

// 'May be cast to any site without enemies.'
registerScript('Saracen Scout', {
  summonAnywhere: true,
  summonFilter: summonIfNoEnemies,
})
