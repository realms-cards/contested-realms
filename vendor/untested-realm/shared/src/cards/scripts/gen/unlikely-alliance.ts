import { registerScript } from '../registry'
import { getCard } from '../../db'

// 'Draw a card for each rarity among allied minions.'
registerScript('Unlikely Alliance', {
  onCast: (ctx) => {
    const rarities = new Set<string>()
    for (const u of Object.values(ctx.state.units)) {
      if (u.controller === ctx.controller && !u.isAvatar) rarities.add(getCard(u.name).rarity ?? 'Ordinary')
    }
    if (rarities.size) ctx.drawCard(ctx.controller, rarities.size)
  },
})
