import { registerScript } from '../registry'
import { ablazeSite } from '../multi-card-utils/ablaze-site'

// "Hamlet's Ablaze!" — same behavior as Castle's Ablaze!, atop an Ordinary or Exceptional site.
registerScript("Hamlet's Ablaze!", ablazeSite({
  name: "Hamlet's Ablaze!",
  rarities: ['Ordinary', 'Exceptional'],
  rarityLabel: 'an Ordinary or Exceptional',
  burnLog: 'The hamlet burns to ash!',
}))
