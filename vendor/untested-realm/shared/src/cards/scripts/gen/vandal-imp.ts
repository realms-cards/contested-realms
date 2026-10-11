import { registerScript, type EffectAPI } from '../registry'
import { pushLog, luckyChoiceIndex } from '../../../engine/effects'

// 'Genesis → Destroy a random artifact.'
registerScript('Vandal Imp', {
  genesis: (ctx) => {
    const arts = Object.values(ctx.state.artifacts)
    if (!arts.length) return
    // which artifact is smashed is random → Kythera/Black Cat or Lucky Charm may bend it
    const pick = ctx.lucky(arts.map((a) => ({ label: a.name, payload: a.id })), 'smash', 'cards')
    if (pick !== undefined) vandalSmash(ctx, pick as string)
  },
  conts: {
    smash: (ctx, c, choice) => vandalSmash(ctx, (c.__opts as string[])[luckyChoiceIndex(c, choice)]),
  },
})

function vandalSmash(ctx: EffectAPI, artId: string): void {
  const a = ctx.state.artifacts[artId]
  if (!a) return
  pushLog(ctx.state, ctx.controller, `The Vandal Imp smashes ${a.name}!`)
  ctx.breakArtifact(a.id)
}
