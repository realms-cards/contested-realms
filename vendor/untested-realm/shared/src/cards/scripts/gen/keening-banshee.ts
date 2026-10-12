import { registerScript } from '../registry'
import { getCard } from '../../db'
import type { PlayerId } from '../../../engine/types'

// 'May be cast for (0) if an allied Mortal died this turn.'
registerScript('Keening Banshee', {
  selfCostModifier: (state, player) => {
    const dead: { name: string; controller: PlayerId }[] = state.flow?.diedThisTurn ?? []
    const mortalDied = dead.some((d) => d.controller === player && getCard(d.name).subtypes.includes('Mortal'))
    return mortalDied ? -(getCard('Keening Banshee').cost ?? 0) : 0
  },
})
