import { registerScript } from '../registry'

// 'Other minions can't untap.' (enforced in beginTurn)
registerScript('Rhitta Gawr of Snowdonia', {
  preventsOtherUntaps: true,
})
