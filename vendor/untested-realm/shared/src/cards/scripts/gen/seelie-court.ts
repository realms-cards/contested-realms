import { registerScript } from '../registry'
import { effSubtypes } from '../../../engine/statics'
import type { PlayerId } from '../../../engine/types'

// 'At the start of your turn, players draw a spell for each Faerie in the realm.'
registerScript('Seelie Court', {
  startOfTurn: (ctx) => {
    const faeries = Object.values(ctx.state.units).filter((u) => !u.isAvatar && effSubtypes(ctx.state, u).includes('Faerie')).length
    if (!faeries) return
    for (const pid of [0, 1] as PlayerId[]) ctx.draw(pid, 'spellbook', faeries)
  },
})
