import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { selfStepsCloser } from '../../../engine/movement'
import { orthAdjacentWrapped } from '../../../engine/grid'

// 'Whenever an enemy casts magic, Sturmgeist steps closer then strikes it if adjacent.'
registerScript('Sturmgeist', {
  onSpellCast: (ctx, by, cardName) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || by === ctx.controller || getCard(cardName).type !== 'Magic') return
    const caster = Object.values(ctx.state.units).find((u) => u.isAvatar && u.controller === by)
    if (!caster) return
    // Sturmgeist is Airborne, so "steps closer" (def. 2) may be a diagonal step
    const steps = selfStepsCloser(ctx.state, self, caster)
    if (steps.length === 1) return sturmArrive(ctx, steps[0])
    if (steps.length > 1) {
      ctx.ask({ kind: 'chooseSquare', title: 'The Sturmgeist howls closer — which way?', data: { squares: steps } }, 'stalk')
      return
    }
    sturmStrike(ctx)
  },
  conts: {
    stalk: (ctx, _c, sq) => {
      if (sq) sturmArrive(ctx, sq)
    },
  },
})

function sturmArrive(ctx: EffectAPI, sq: { x: number; y: number }): void {
  const self = ctx.state.units[ctx.sourceId]
  if (!self) return
  ctx.teleport(self.id, sq.x, sq.y, self.region)
  sturmStrike(ctx)
}

// strike the enemy Avatar if it's now adjacent (nearby, region-locked to the source)
function sturmStrike(ctx: EffectAPI): void {
  const self = ctx.state.units[ctx.sourceId]
  if (!self) return
  const prey = Object.values(ctx.state.units).find(
    (u) => u.isAvatar && u.controller !== ctx.controller && u.region === self.region && orthAdjacentWrapped(ctx.state, self.x, self.y).some((s) => s.x === u.x && s.y === u.y),
  )
  if (prey) ctx.strike(self, { unit: prey.id })
}
