import { registerScript, type EffectAPI } from '../registry'
import { pushLog, luckyChoiceIndex } from '../../../engine/effects'
import { awardAchievement } from '../../../engine/achievements.catalog'

// 'Other units at this site have "Tap → Roll a d20. On a 14+, banish Salmon of
//  Knowledge and draw three spells."'
registerScript('Salmon of Knowledge', {
  grantsAbilities: (state, selfId, unit) => {
    const self = state.units[selfId]
    if (!self || unit.id === selfId) return []
    if (unit.x !== self.x || unit.y !== self.y) return []
    return [{
      key: 'salmon:catch',
      label: 'Try to catch the Salmon of Knowledge (d20, 14+)',
      cost: { tap: true },
      contOwner: 'Salmon of Knowledge', // conts resolve on the Salmon's script, not the catcher's
      effect: (ctx) => {
        // the d20 → Kythera/Black Cat (choose any 1-20) or Lucky Charm (roll N+1, choose)
        const roll = ctx.lucky(Array.from({ length: 20 }, (_, i) => ({ label: String(i + 1), payload: i + 1 })), 'catch', 'options')
        if (roll !== undefined) salmonCatch(ctx, roll as number, selfId) // THIS Salmon (the one granting the ability)
      },
    }]
  },
  conts: {
    // contOwner is 'Salmon of Knowledge', so ctx.sourceId is the Salmon here
    catch: (ctx, c, choice) => salmonCatch(ctx, (c.__opts as number[])[luckyChoiceIndex(c, choice)], ctx.sourceId),
  },
})

function salmonCatch(ctx: EffectAPI, roll: number, salmonId: string): void {
  pushLog(ctx.state, ctx.controller, `🎲 d20: ${roll}`)
  if (roll < 14) return
  const salmon = ctx.state.units[salmonId] // the SPECIFIC Salmon, not whichever copy `find` returns first
  if (salmon && salmon.name === 'Salmon of Knowledge') {
    // They call you Sanpei — the caught Salmon belonged to an opponent
    if (salmon.controller !== ctx.controller) awardAchievement(ctx.state, 'sanpei', ctx.controller)
    ctx.banish(salmon.id)
    ctx.draw(ctx.controller, 'spellbook', 3)
    pushLog(ctx.state, ctx.controller, 'The Salmon is caught — its knowledge floods in!')
  }
}
