import { registerScript } from '../registry'
import { pushLog, checkStateBased } from '../../../engine/effects'
import { GRID_H, GRID_W, siteAt, unitsAt, edgesConnected } from '../../../engine/grid'

// 'Choose clockwise or counterclockwise. Each unit and artifact atop sites in a
//  two-by-two area is pushed one step in that direction.'
registerScript('Whirlwind', {
  onCast: (ctx) => {
    const wrap = edgesConnected(ctx.state) // Globe: edge anchors are legal, the 2×2 wraps
    const maxX = wrap ? GRID_W : GRID_W - 1
    const maxY = wrap ? GRID_H : GRID_H - 1
    const squares: { x: number; y: number }[] = []
    for (let x = 0; x < maxX; x++) for (let y = 0; y < maxY; y++) squares.push({ x, y })
    ctx.ask({ kind: 'chooseSquare', title: 'Whirlwind: bottom-left corner of the two-by-two area.', data: { squares, area2x2: true } }, 'eye')
  },
  conts: {
    eye: (ctx, _c, sq) => {
      if (!sq) return
      ctx.ask({ kind: 'chooseOption', title: 'Spin which way?', data: { options: ['clockwise', 'counterclockwise'] } }, 'spin', { ax: sq.x, ay: sq.y })
    },
    spin: (ctx, c, choice) => {
      if (typeof choice !== 'string') return
      const ax = c.ax as number
      const ay = c.ay as number
      const cw = choice === 'clockwise'
      // the 2×2 corners, clipped to the board — or edge-WRAPPED under Magellan Globe
      const wrap = edgesConnected(ctx.state)
      const nx = wrap ? (ax + 1) % GRID_W : ax + 1
      const ny = wrap ? (ay + 1) % GRID_H : ay + 1
      // ring order (bl -> br -> tr -> tl); push each occupant to the next cell
      const ring = cw
        ? [{ x: ax, y: ay }, { x: ax, y: ny }, { x: nx, y: ny }, { x: nx, y: ay }]
        : [{ x: ax, y: ay }, { x: nx, y: ay }, { x: nx, y: ny }, { x: ax, y: ny }]
      const unitMoves: { id: string; to: { x: number; y: number } }[] = []
      const artMoves: { thing: { x: number; y: number }; to: { x: number; y: number } }[] = []
      for (let i = 0; i < 4; i++) {
        const cur = ring[i]
        const to = ring[(i + 1) % 4]
        if (!siteAt(ctx.state, cur.x, cur.y) || !siteAt(ctx.state, to.x, to.y)) continue
        for (const u of unitsAt(ctx.state, cur.x, cur.y, 'surface')) unitMoves.push({ id: u.id, to })
        for (const a of Object.values(ctx.state.artifacts)) {
          if (!a.carriedBy && a.x === cur.x && a.y === cur.y && a.region === 'surface') artMoves.push({ thing: a, to })
        }
      }
      // "pushed one step" — a forced push (respects Cage of Sidrak / moveProtected / can't-push-into-void)
      for (const m of unitMoves) ctx.teleport(m.id, m.to.x, m.to.y, 'surface', { push: true })
      for (const m of artMoves) { m.thing.x = m.to.x; m.thing.y = m.to.y }
      pushLog(ctx.state, ctx.controller, `The whirlwind spins everything ${choice}!`)
      checkStateBased(ctx.state)
    },
  },
})
