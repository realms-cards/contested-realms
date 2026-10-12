import { registerScript } from '../registry'
import { sacForDiscount } from '../multi-card-utils/sac-for-discount'

// 'Sacrifice Mix Aer → This turn, bearer's next Air spell requires no threshold and costs ③ less.'
registerScript('Mix Aer', {
  abilities: [{
    key: 'mix',
    label: 'Sacrifice → next Air spell −③, no threshold',
    cost: {},
    effect: (ctx) => sacForDiscount(ctx, 3, ['Air']),
  }],
})
