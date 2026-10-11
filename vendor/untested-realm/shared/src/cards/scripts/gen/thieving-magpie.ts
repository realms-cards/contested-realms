import { registerScript } from '../registry'
import { getCard } from '../../db'

// 'Airborne / May pick up carried artifacts with cost (1) or less.'
registerScript('Thieving Magpie', {
  stealsCarried: (_state, _picker, art) => (getCard(art.name).cost ?? 0) <= 1,
})
