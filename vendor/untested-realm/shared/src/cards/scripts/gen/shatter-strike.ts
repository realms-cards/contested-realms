import { registerScript, type EffectAPI } from '../registry'
import { orthAdjacentWrapped } from '../../../engine/grid'

// 'An ally targets an enemy adjacent to them, destroying an artifact they're
//  carrying and then striking them.'
registerScript('Shatter Strike', {
  // "an ally" / "an enemy" (not "minion") — both may be Avatars
  targets: [
    { what: 'unit', count: 1, targeted: false, owner: 'ally', label: 'an ally' },
    { what: 'unit', count: 1, targeted: true, owner: 'enemy', label: 'an adjacent enemy' },
  ],
  onCast: (ctx) => {
    const [t1, t2] = ctx.targets
    if (!t1 || !t2 || !('unit' in t1) || !('unit' in t2)) return
    const ally = ctx.state.units[t1.unit]
    const foe = ctx.state.units[t2.unit]
    if (!ally || !foe) return
    if (!orthAdjacentWrapped(ctx.state, ally.x, ally.y).some((s) => s.x === foe.x && s.y === foe.y)) return ctx.log('They are not adjacent.')
    const arts = foe.carrying.filter((id) => ctx.state.artifacts[id])
    if (arts.length <= 1) return shatterResolve(ctx, ally.id, foe.id, arts[0])
    // several carried artifacts → the caster chooses which one to shatter
    ctx.ask(
      { kind: 'chooseCards', title: 'Destroy which artifact?', data: { cards: arts.map((id) => ctx.state.artifacts[id]?.name ?? '?'), pick: 1, upTo: false } },
      'shatter',
      { allyId: ally.id, foeId: foe.id, artIds: arts },
    )
  },
  conts: {
    shatter: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      const artIds = c.artIds as string[]
      const artId = typeof idx === 'number' && idx >= 0 && idx < artIds.length ? artIds[idx] : undefined
      shatterResolve(ctx, c.allyId as string, c.foeId as string, artId)
    },
  },
})

// destroy the chosen carried artifact (if any), then strike — only if both are alive.
function shatterResolve(ctx: EffectAPI, allyId: string, foeId: string, artId?: string) {
  const foe = ctx.state.units[foeId]
  if (foe && artId && ctx.state.artifacts[artId]) {
    foe.carrying = foe.carrying.filter((id) => id !== artId)
    ctx.breakArtifact(artId)
  }
  const ally = ctx.state.units[allyId]
  if (ally && ctx.state.units[foeId]) ctx.strike(ally, { unit: foeId })
}
