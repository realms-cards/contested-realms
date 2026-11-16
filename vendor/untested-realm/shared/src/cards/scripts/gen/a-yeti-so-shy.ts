import { registerScript } from '../registry'
import { occupiedSquares, orthAdjacentWrapped } from '../../../engine/grid'

// 'Stealth, Outerbound'
// Codex, Outerbound: "disabled while not occupying at least one location on the outside of the realm,
// meaning a location in a square that has fewer than four other adjacent squares. The outerbound ability
// persists even when disabled." Counted with the wrapped neighbours: under the Magellan Globe every square
// has four, so nothing is on the outside. (selfDisabled is skipped only when silenced — it persists through
// its own disable.) Stealth is printed.
registerScript('A Yeti So Shy', {
  selfDisabled: (state, self) => !occupiedSquares(self).some((q) => orthAdjacentWrapped(state, q.x, q.y).length < 4),
})
