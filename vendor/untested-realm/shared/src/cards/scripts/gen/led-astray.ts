import { registerScript } from '../registry'
import { adjacentSquaresW, siteAt, unitsAt } from '../../../engine/grid'
import { isLegalStep } from '../../../engine/movement'
import { checkStateBased, emitUnitMoved } from '../../../engine/effects'

// "Choose any number of enemies at target location. They take a step together to
// another location they're adjacent to."
registerScript('Led Astray', {
  targets: [{ what: 'square', count: 1, targeted: true, label: 'target location' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('square' in t)) return
    const region = t.square.region ?? ctx.caster!.region
    const enemies = unitsAt(ctx.state, t.square.x, t.square.y, region).filter((u) => u.controller !== ctx.controller)
    if (!enemies.length) return
    ctx.ask({ kind: 'chooseSquare', title: 'Lead them astray to which adjacent square?', data: {} }, 'astray', { from: t.square, region })
  },
  conts: {
    astray: (ctx, contCtx, choice) => {
      const { x, y } = choice ?? {}
      if (x === undefined) return
      if (!adjacentSquaresW(ctx.state, contCtx.from.x, contCtx.from.y).some((s) => s.x === x && s.y === y)) return ctx.log('Not adjacent.')
      if (contCtx.region === 'surface' && !siteAt(ctx.state, x, y)) return ctx.log('No site there.')
      for (const u of unitsAt(ctx.state, contCtx.from.x, contCtx.from.y, contCtx.region)) {
        if (u.controller === ctx.controller) continue // enemies INCLUDING the enemy avatar (card says "enemies")
        const from = { x: u.x, y: u.y, region: u.region }
        const to = { x, y, region: u.region }
        // "take a step" is a STEP — a unit that can't take it (Immobile, a wall, an entry ban) stays put.
        if (!isLegalStep(ctx.state, u, from, to)) continue
        u.x = x
        u.y = y
        emitUnitMoved(ctx.state, u, from) // a forced step fires "enters here" triggers
      }
      checkStateBased(ctx.state)
    },
  },
})
