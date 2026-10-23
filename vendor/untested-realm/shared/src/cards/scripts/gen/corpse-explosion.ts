import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { GRID_H, GRID_W, siteAt, unitsAt, aura2x2Squares, edgesConnected, squareLabel } from '../../../engine/grid'
import { cemeteryProtected, payZoneToll } from '../../../engine/statics'
import type { PlayerId } from '../../../engine/types'

// 'Deal a dead minion to each site in a two-by-two area. Deal damage equal to
//  each corpse's power to units there, then banish the corpses.'
registerScript('Corpse Explosion', {
  onCast: (ctx) => {
    // Offer every 2x2 AREA (rendered as intersection markers, area2x2) that holds at
    // least one site — VOID cells inside the area are fine, they just receive no
    // corpse. Only an all-void area (nothing to detonate on) is skipped.
    const wrap = edgesConnected(ctx.state) // Globe: edge anchors are legal, the 2×2 wraps
    const maxX = wrap ? GRID_W : GRID_W - 1
    const maxY = wrap ? GRID_H : GRID_H - 1
    const squares: { x: number; y: number }[] = []
    for (let x = 0; x < maxX; x++) for (let y = 0; y < maxY; y++) {
      const cells = aura2x2Squares({ x, y }, wrap)
      if (cells.some((s) => siteAt(ctx.state, s.x, s.y))) squares.push({ x, y })
    }
    if (!squares.length) return
    ctx.ask({ kind: 'chooseSquare', title: 'Corpse Explosion: choose the two-by-two area.', data: { squares, area2x2: true } }, 'area')
  },
  conts: {
    area: (ctx, _c, sq) => {
      if (!sq) return
      const cells = aura2x2Squares({ x: sq.x, y: sq.y }, edgesConnected(ctx.state)).filter((s) => siteAt(ctx.state, s.x, s.y))
      dealCorpse(ctx, cells, 0)
    },
    corpse: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      const cells = c.cells as { x: number; y: number }[]
      const n = c.n as number
      if (typeof idx === 'number') {
        const cardId = (c.dead as string[])[idx]
        // the corpse lies in its owner's cemetery (either player's) → banished to its owner's pile
        const owner = cardId ? ctx.state.players[ctx.state.cards[cardId].owner] : null
        if (cardId && owner && owner.cemetery.includes(cardId)) {
          const power = getCard(ctx.state.cards[cardId].name).attack ?? 0
          owner.cemetery.splice(owner.cemetery.indexOf(cardId), 1)
          owner.banished.push(cardId)
          for (const u of unitsAt(ctx.state, cells[n].x, cells[n].y)) ctx.dealDamage({ unit: u.id }, power)
          pushLog(ctx.state, ctx.controller, `${ctx.state.cards[cardId].name} detonates for ${power} at ${squareLabel(cells[n].x, cells[n].y)}!`)
        }
      }
      dealCorpse(ctx, cells, n + 1)
    },
  },
})

function dealCorpse(ctx: EffectAPI, cells: { x: number; y: number }[], n: number): void {
  if (n >= cells.length) return
  // corpses come from ANY cemetery (FAQ: "taking minions from any cemetery")
  const dead: string[] = []
  for (const pid of [0, 1] as PlayerId[]) {
    if (cemeteryProtected(ctx.state, pid, ctx.controller)) continue // Wormelow Tump
    for (const id of ctx.state.players[pid].cemetery) {
      if (getCard(ctx.state.cards[id].name).type === 'Minion') dead.push(id)
    }
  }
  if (!dead.length) return
  // one Bureau of Occult Control toll covers the whole explosion — paid before the first corpse
  if (n === 0 && !payZoneToll(ctx.state, ctx.controller)) return ctx.log('The Bureau of Occult Control demands (2) for cemetery access.')
  ctx.ask(
    { kind: 'chooseCards', title: `Corpse for ${squareLabel(cells[n].x, cells[n].y)}? (skip to stop)`, data: { cards: dead.map((id) => `${ctx.state.cards[id].name} (${ctx.state.players[ctx.state.cards[id].owner].name})`), pick: 1, upTo: true } },
    'corpse',
    { cells, n, dead },
  )
}
