import { registerScript } from '../registry'
import { sacForDiscount } from '../multi-card-utils/sac-for-discount'

// 'Sacrifice Four Waters → This turn, bearer's next elemental spell requires no
//  threshold and costs (4) less to cast.'
registerScript('Four Waters of Paradise', {
  abilities: [{
    key: 'libation',
    label: 'Sacrifice → next elemental spell −④, no threshold',
    cost: {},
    effect: (ctx) => sacForDiscount(ctx, 4, null),
  }],
})
