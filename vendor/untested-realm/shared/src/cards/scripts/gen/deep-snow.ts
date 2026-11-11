import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { tapUnit } from '../../../engine/effects'
import type { TargetSpec } from '../registry'
import { trapScript, trapTargets } from '../multi-card-utils/trap'

// 'Trap (1) → Tap minions at target adjacent site. They don't untap the next time they would.'
// (Like Sir Tristan: a skipUntap counter the next untap consumes.) Targeting the site breaks an enemy
// site's Ward instead.
const SPEC: TargetSpec = { what: 'site', count: 1, targeted: true, where: 'adjacent', label: 'target adjacent site' }

registerScript('Deep Snow', trapScript({
  label: 'tap the minions at an adjacent site; they stay tapped',
  mana: 1,
  available: (state, site, player) => trapTargets(state, site.id, player, SPEC).length > 0,
  effect: (ctx, site) => {
    const ids = trapTargets(ctx.state, site.id, ctx.controller, SPEC).flatMap((r) => ('site' in r ? [r.site] : []))
    if (!ids.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'Deep Snow: bury which adjacent site?', data: { candidates: ids, count: 1, kind: 'site' } }, 'snow')
  },
  conts: {
    snow: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const target = typeof id === 'string' ? ctx.state.sites[id] : undefined
      if (!target) return
      for (const u of unitsAt(ctx.state, target.x, target.y)) {
        if (u.isAvatar || u.region === 'void') continue
        tapUnit(ctx.state, u) // through the tap hook (False Idol)
        u.counters = { ...u.counters, skipUntap: 1 }
      }
      ctx.log(`Deep snow buries ${target.name}.`)
    },
  },
}))
