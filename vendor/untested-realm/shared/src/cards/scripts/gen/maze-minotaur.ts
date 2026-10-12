import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// "Enemy minions can't move themselves out of a maze of nine locations nearby
//  Maze Minotaur."
registerScript('Maze Minotaur', {
  unitEntryFilter: (state, selfId, mover, from, to) => {
    const self = state.units[selfId]
    if (!self || mover.isAvatar || mover.controller === self.controller) return true
    const maze = nearbySquaresW(state, self.x, self.y)
    const inMaze = maze.some((s) => s.x === from.x && s.y === from.y)
    const stillIn = maze.some((s) => s.x === to.x && s.y === to.y)
    return !inMaze || stillIn
  },
})
