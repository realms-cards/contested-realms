import { registerScript } from '../registry'

// 'All healing is halved, rounded down.' (enforced in gainLife/healUnit; stacks)
registerScript('River of Blood', {
  healingMultiplier: 0.5,
})
