import { registerScript } from '../registry'
import { omphalosEndOfTurn } from '../multi-card-utils/omphalos-end-of-turn'

registerScript('Algor Omphalos', {
  endOfTurn: (ctx) => omphalosEndOfTurn(ctx, 'Algor Omphalos'),
})
