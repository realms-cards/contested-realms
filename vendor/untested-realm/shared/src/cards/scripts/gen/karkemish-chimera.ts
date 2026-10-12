import { registerScript, getScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'
import { effKeywords } from '../../../engine/statics'

// -------------------------------------------------------- Karkemish Chimera ----
// 'Can simultaneously attack up to three units at the same location.'
registerScript('Karkemish Chimera', {
  multiAttack: 3,
  onUnitAttacked: (ctx, target, attacker) => {
    if (attacker.id !== ctx.sourceId) return
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const kw = effKeywords(ctx.state, self)
    const truesight = self.carrying.some((id) => getScript(ctx.state.artifacts[id]?.name ?? '')?.bearerTruesight)
    const others = unitsAt(ctx.state, target.x, target.y, target.region)
      .filter(
        (u) =>
          u.id !== target.id &&
          u.id !== self.id &&
          u.controller !== self.controller &&
          !(u.stealth && !truesight) &&
          !(effKeywords(ctx.state, u).airborne && !kw.airborne && u.region === 'surface'),
      )
      .map((u) => u.id)
    if (!others.length) return
    ctx.ask(
      { kind: 'chooseTargets', title: 'The Chimera has heads to spare — attack up to two more units there?', data: { candidates: others, count: 2, upTo: true, kind: 'unit' } },
      'heads',
    )
  },
  conts: {
    heads: (ctx, _c, choice) => {
      const ids = (Array.isArray(choice) ? choice : [choice]).filter((id): id is string => typeof id === 'string' && !!ctx.state.units[id])
      if (!ids.length) return
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.multiTargets = { attackerId: ctx.sourceId, ids: ids.slice(0, 2), turn: ctx.state.turn }
      pushLog(ctx.state, ctx.controller, `The Chimera's other heads snap at ${ids.length} more!`)
    },
  },
})
