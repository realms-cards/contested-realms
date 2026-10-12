import { registerScript } from '../registry'
import { omphalosEndOfTurn } from '../multi-card-utils/omphalos-end-of-turn'

registerScript('Torrid Omphalos', {
  endOfTurn: (ctx) => omphalosEndOfTurn(ctx, 'Torrid Omphalos'),
})
