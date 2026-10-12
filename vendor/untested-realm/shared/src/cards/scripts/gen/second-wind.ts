import { registerScript } from '../registry'
import { orthAdjacentWrapped, siteAt } from '../../../engine/grid'
import { isLegalStep } from '../../../engine/movement'
import { emitUnitMoved } from '../../../engine/effects'

// 'An allied minion takes a step. / You may cast this from your cemetery,
//  banishing it afterward.'
registerScript('Second Wind', {
  castFromCemetery: { banishAfter: true },
  targets: [{ what: 'minion', count: 1, targeted: false, owner: 'ally', label: 'an allied minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    // "takes a step" — only offer legal steps (Immobile / walls / entry-bans block it)
    const squares = orthAdjacentWrapped(ctx.state, u.x, u.y).filter(
      (s) => siteAt(ctx.state, s.x, s.y) && isLegalStep(ctx.state, u, { x: u.x, y: u.y, region: u.region }, { x: s.x, y: s.y, region: u.region }),
    )
    if (!squares.length) return
    ctx.ask({ kind: 'chooseSquare', title: `${u.name} finds a second wind — step where?`, data: { squares } }, 'stride', { unitId: u.id })
  },
  conts: {
    stride: (ctx, c, sq) => {
      const u = ctx.state.units[c.unitId as string]
      if (!u || !sq) return
      const from = { x: u.x, y: u.y, region: u.region }
      if (!isLegalStep(ctx.state, u, from, { x: sq.x, y: sq.y, region: u.region })) return
      u.x = sq.x; u.y = sq.y
      emitUnitMoved(ctx.state, u, from)
    },
  },
})
