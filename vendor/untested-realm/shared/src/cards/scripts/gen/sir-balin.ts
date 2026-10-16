import { registerScript } from '../registry'
import { pushLog, checkStateBased } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'
import { terrainAt } from '../../../engine/statics'
import { burrowOccupantsAt } from '../multi-card-utils/burrow-occupants'

// Knights of the Round Table ------------------------------------------------

// 'Whenever Sir Balin strikes an Avatar, destroy that Avatar's site then burrow
//  other minions and artifacts there.'
// Order matters: the site is DESTROYED first, then we burrow into the resulting ruins —
// using the same footprint-aware minion + carried/loose-artifact burrow as Cave-In (minus
// Cave-In's keep-the-site). You can't burrow into water, so if the destruction leaves the
// square flooded (a water ruins — e.g. The Great Drowning, a flood aura) the burrow fails
// outright: nothing goes underground.
registerScript('Sir Balin', {
  onAllyStrikesAvatar: (ctx, striker, avatar) => {
    if (striker.id !== ctx.sourceId) return
    const site = siteAt(ctx.state, avatar.x, avatar.y)
    if (!site) return
    const { x, y } = avatar
    ctx.destroySite(site.id) // leaves rubble; settles flooding via its own checkStateBased
    pushLog(ctx.state, ctx.controller, "Sir Balin's dolorous stroke shatters the very ground!")
    if (terrainAt(ctx.state, x, y) !== 'land') {
      pushLog(ctx.state, ctx.controller, 'The flooded ruins swallow nothing underground.')
      return
    }
    burrowOccupantsAt(ctx.state, x, y, (u) => u.id === striker.id) // spare Balin himself
    checkStateBased(ctx.state)
  },
})
