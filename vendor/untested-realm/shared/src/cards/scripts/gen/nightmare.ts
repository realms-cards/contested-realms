import { registerScript, type EffectAPI } from '../registry'
import { adjacentSquaresW, unitsAt, siteAt } from '../../../engine/grid'

// 'At the end of your turn, for each enemy minion here, you may push it to an adjacent location or void.'
function nightmareAsk(ctx: EffectAPI, queue: string[]): void {
  let rest = queue
  while (rest.length) {
    const id = rest[0]
    rest = rest.slice(1)
    const u = ctx.state.units[id]
    if (!u) continue
    ctx.ask(
      { kind: 'chooseSquare', title: `Nightmare: push ${u.name} to an adjacent square (a siteless square is the void); click its own square to leave it` },
      'push',
      { queue: rest, pushTarget: id },
    )
    return
  }
}

registerScript('Nightmare', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const queue = unitsAt(ctx.state, self.x, self.y, self.region)
      .filter((u) => !u.isAvatar && u.controller !== ctx.controller)
      .map((u) => u.id)
    nightmareAsk(ctx, queue)
  },
  conts: {
    push: (ctx, contCtx, choice) => {
      const queue: string[] = contCtx.queue ?? []
      const u = ctx.state.units[contCtx.pushTarget]
      const self = ctx.state.units[ctx.sourceId]
      if (u && self && choice && typeof choice.x === 'number') {
        const notOwn = !(choice.x === self.x && choice.y === self.y)
        const adjacent = adjacentSquaresW(ctx.state, self.x, self.y).some((s) => s.x === choice.x && s.y === choice.y)
        if (adjacent && notOwn) {
          const site = siteAt(ctx.state, choice.x, choice.y)
          // "push it to an adjacent location OR void": a real location keeps the pushed unit's region;
          // the void is the card's deliberate exception (intoVoid) — still a forced PUSH (Cage/push-ban/
          // move-protection aware), and a non-Voidwalk minion shoved there is lost to the abyss.
          ctx.teleport(u.id, choice.x, choice.y, site ? u.region : 'void', { push: true, intoVoid: !site })
        }
      }
      nightmareAsk(ctx, queue)
    },
  },
})
