import { registerScript } from '../registry'
import { sacForDiscount } from '../multi-card-utils/sac-for-discount'

// 'Sacrifice Mix Aqua → This turn, bearer's next Water spell requires no threshold and costs ③ less.'
registerScript('Mix Aqua', {
  abilities: [{
    key: 'mix',
    label: 'Sacrifice → next Water spell −③, no threshold',
    cost: {},
    effect: (ctx) => sacForDiscount(ctx, 3, ['Water']),
  }],
})
