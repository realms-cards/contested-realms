import { registerScript } from '../registry'
import { sacForDiscount } from '../multi-card-utils/sac-for-discount'

// 'Sacrifice Mix Terra → This turn, bearer's next Earth spell requires no threshold and costs ③ less.'
registerScript('Mix Terra', {
  abilities: [{
    key: 'mix',
    label: 'Sacrifice → next Earth spell −③, no threshold',
    cost: {},
    effect: (ctx) => sacForDiscount(ctx, 3, ['Earth']),
  }],
})
