import { registerScript } from '../registry'
import { ablazeSite } from '../multi-card-utils/ablaze-site'

// "Conjure atop an Elite or Unique site. / At the start of your turn, destroy
// this site, minions atop it, and Castle's Ablaze."
registerScript("Castle's Ablaze!", ablazeSite({
  name: "Castle's Ablaze!",
  rarities: ['Elite', 'Unique'],
  rarityLabel: 'an Elite or Unique',
  burnLog: 'The castle burns to the ground!',
}))
