import { registerScript } from '../registry'
import { pushLog, emitUnitMoved } from '../../../engine/effects'
import { orthAdjacentWrapped, siteAt } from '../../../engine/grid'
import { isLegalStep } from '../../../engine/movement'
import { canRespond, payResponse } from '../multi-card-utils/response'

// 'May be cast when an ally is attacked. / An attacked ally may move to another
//  adjacent location to evade the attack.'
registerScript('Dodge Roll', {
  listensFromHand: true,
  onUnitAttacked: (ctx, target) => {
    if (target.controller !== ctx.controller) return
    if (!canRespond(ctx, ctx.sourceId)) return
    ctx.ask(
      { kind: 'yesNo', title: `${target.name} is attacked — cast Dodge Roll?`, player: ctx.controller },
      'roll',
      { targetId: target.id },
    )
  },
  conts: {
    roll: (ctx, c, yes) => {
      if (!yes || !payResponse(ctx, ctx.sourceId)) return
      const u = ctx.state.units[c.targetId as string]
      if (!u) return
      // "move to another adjacent location" is a STEP — only offer legal ones (Immobile / walls / entry-bans)
      const squares = orthAdjacentWrapped(ctx.state, u.x, u.y).filter((s) => siteAt(ctx.state, s.x, s.y) && isLegalStep(ctx.state, u, { x: u.x, y: u.y, region: u.region }, { x: s.x, y: s.y, region: u.region }))
      if (!squares.length) return
      ctx.ask({ kind: 'chooseSquare', title: `${u.name} dodge-rolls where?`, data: { squares } }, 'tumble', { targetId: u.id })
    },
    tumble: (ctx, c, sq) => {
      const u = ctx.state.units[c.targetId as string]
      if (!u || !sq) return
      const from = { x: u.x, y: u.y, region: u.region }
      if (!isLegalStep(ctx.state, u, from, { x: sq.x, y: sq.y, region: u.region })) return
      u.x = sq.x; u.y = sq.y
      emitUnitMoved(ctx.state, u, from)
      pushLog(ctx.state, ctx.controller, `${u.name} tumbles clear — the attack finds nothing!`)
    },
  },
})
