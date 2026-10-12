import { registerScript } from '../registry'
import { omphalosEndOfTurn } from '../multi-card-utils/omphalos-end-of-turn'

registerScript('Dank Omphalos', {
  endOfTurn: (ctx) => omphalosEndOfTurn(ctx, 'Dank Omphalos'),
})
