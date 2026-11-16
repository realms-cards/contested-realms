import { registerScript } from '../registry'
import { siteAt, unitsAt } from '../../../engine/grid'
import type { HibernalFreeze } from '../../../engine/statics'

// 'At the end of your turn, freeze this site and other minions here. They're disabled until the Legion
// leaves the realm.' "Freeze" isn't a codex term: the second sentence defines it — the site and the minions
// are disabled (a disabled site has no abilities and provides no mana or affinity). The freeze is an effect
// the trigger leaves behind, so it outlasts a later silence of the Legion and ends only when the Legion
// leaves the realm (statics: directlyDisabled / siteDisabled read flow.hibernalFreezes). "Here" for a
// minion is its own region: the minions beside it there, and the site above/below it.
registerScript('Hibernal Legion', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const flow = (ctx.state.flow = ctx.state.flow ?? {})
    // a freeze ends once its Legion has left the realm (a Permafrost holds its minions on its own)
    const live = ((flow.hibernalFreezes ?? []) as HibernalFreeze[]).filter((f) => !!ctx.state.units[f.legionId])
    const site = self.region === 'void' ? null : siteAt(ctx.state, self.x, self.y)
    const others = unitsAt(ctx.state, self.x, self.y, self.region).filter((u) => !u.isAvatar && u.id !== self.id).map((u) => u.id)
    const mine = live.find((f) => f.legionId === self.id && f.siteId === site?.id)
    if (mine) mine.unitIds = [...new Set([...mine.unitIds, ...others])]
    else live.push({ legionId: self.id, siteId: site?.id, unitIds: others })
    flow.hibernalFreezes = live
    ctx.log(`❄ ${self.name} freezes ${site ? site.name : 'its location'}${others.length ? ` and ${others.length} minion${others.length === 1 ? '' : 's'}` : ''}.`)
  },
})
