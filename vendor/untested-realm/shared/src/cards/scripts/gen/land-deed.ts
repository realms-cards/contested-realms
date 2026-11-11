import { registerScript } from '../registry'

// "Bearer has 'You control this site.'" (Land Deed — control follows the bearer's square). An ongoing
// ability: checkStateBased applies it whenever the board settles (see bearerControlsSite).
registerScript('Land Deed', {
  bearerControlsSite: true,
})
