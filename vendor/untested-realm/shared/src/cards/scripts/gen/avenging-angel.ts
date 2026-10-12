import { registerScript } from '../registry'
import type { PlayerId } from '../../../engine/types'

// 'Has Charge and Lethal if an ally died on your opponent's last turn.'
registerScript('Avenging Angel', {
  selfKeywords: (state, self) => {
    const died: { name: string; controller: PlayerId }[] = state.flow?.diedLastTurn ?? []
    return died.some((d) => d.controller === self.controller) ? ['charge', 'lethal'] : []
  },
})
