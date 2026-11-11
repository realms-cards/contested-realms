import { registerScript } from '../registry'
import { effKeywords, isDisabled } from '../../../engine/statics'
import type { TargetSpec } from '../registry'
import { trapScript, trapTargets } from '../multi-card-utils/trap'

// 'Trap (1) → Destroy target adjacent disabled or immobile minion.'
const SPEC: TargetSpec = {
  what: 'minion', count: 1, targeted: true, where: 'adjacent', label: 'target adjacent disabled or immobile minion',
  filter: (state, u) => isDisabled(state, u) || !!effKeywords(state, u).immobile,
}

registerScript('Icicle Dome', trapScript({
  label: 'destroy an adjacent disabled or immobile minion',
  mana: 1,
  available: (state, site, player) => trapTargets(state, site.id, player, SPEC).length > 0,
  effect: (ctx, site) => {
    const ids = trapTargets(ctx.state, site.id, ctx.controller, SPEC).flatMap((r) => ('unit' in r ? [r.unit] : []))
    if (!ids.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'Icicle Dome: destroy which minion?', data: { candidates: ids, count: 1, kind: 'unit' } }, 'impale')
  },
  conts: {
    impale: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (typeof id === 'string' && ctx.state.units[id]) ctx.kill(id)
    },
  },
}))
