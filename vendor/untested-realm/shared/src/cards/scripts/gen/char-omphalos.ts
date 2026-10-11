import { registerScript } from '../registry'
import { omphalosEndOfTurn } from '../multi-card-utils/omphalos-end-of-turn'

registerScript('Char Omphalos', {
  endOfTurn: (ctx) => omphalosEndOfTurn(ctx, 'Char Omphalos'),
})
