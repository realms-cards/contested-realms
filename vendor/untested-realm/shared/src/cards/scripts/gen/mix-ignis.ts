import { registerScript } from '../registry'
import { sacForDiscount } from '../multi-card-utils/sac-for-discount'

// 'Sacrifice Mix Ignis → This turn, bearer's next Fire spell requires no threshold and costs ③ less.'
registerScript('Mix Ignis', {
  abilities: [{
    key: 'mix',
    label: 'Sacrifice → next Fire spell −③, no threshold',
    cost: {},
    effect: (ctx) => sacForDiscount(ctx, 3, ['Fire']),
  }],
})
