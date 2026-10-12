import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'

// 'Once per game, if you would die, you may sacrifice a minion atop this Altar
//  instead.' The Avatar need NOT stand on the Altar — only the sacrificed minion
//  must. Handled at the death blow itself (the "game-end" moment) as a prompt via
//  the engine's avatarDeathSave hook, so the controller CHOOSES which minion (and
//  may decline). See offerAvatarDeathSave in effects.ts.
registerScript('Altar of Malachai', {
  avatarDeathSave: (state, selfId, avatar) => {
    const site = state.sites[selfId]
    if (!site || (site as any).altarUsed) return []
    return unitsAt(state, site.x, site.y, 'surface')
      .filter((u) => !u.isAvatar && u.controller === avatar.controller)
      .map((u) => u.id)
  },
})
