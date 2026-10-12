import { registerScript } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'
import { pushLog, wardUnit } from '../../../engine/effects'
import { isEvilU } from '../multi-card-utils/is-evil-u'

// 'Ward a nearby minion or site.'
registerScript('Bless', {
  onCast: (ctx) => {
    const caster = ctx.caster!
    const units = nearbySquaresW(ctx.state, caster.x, caster.y)
      // nearby minion is region-locked to the source
      .flatMap((s) => unitsAt(ctx.state, s.x, s.y, caster.region))
      .filter((u) => !u.isAvatar && !isEvilU(ctx.state, u))
      .map((u) => u.id)
    const sites = Object.values(ctx.state.sites)
      .filter((s) => !s.isRubble && nearbySquaresW(ctx.state, caster.x, caster.y).some((sq) => sq.x === s.x && sq.y === s.y))
      .map((s) => s.id)
    const candidates = [...new Set([...units, ...sites])]
    if (!candidates.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'Bless which minion or site?', data: { candidates, count: 1, kind: 'unit' } }, 'bless')
  },
  conts: {
    bless: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (!id) return
      const u = ctx.state.units[id]
      const s = ctx.state.sites[id]
      if (u) wardUnit(ctx.state, u)
      if (s) s.ward = true // sites have no Evil clause — kept direct
      pushLog(ctx.state, ctx.controller, 'A ward of light descends.')
    },
  },
})
