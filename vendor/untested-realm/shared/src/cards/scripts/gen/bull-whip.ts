import { registerScript, type EffectAPI } from '../registry'
import { awardAchievement } from '../../../engine/achievements.catalog'

/** once-per-turn guard for artifact abilities (artifacts lack usedThisTurn) */
function artOncePerTurn(ctx: EffectAPI): boolean {
  const art = ctx.state.artifacts[ctx.sourceId]
  if (!art) return false
  art.counters = art.counters ?? {}
  if (art.counters.usedTurn === ctx.state.turn) return false
  art.counters.usedTurn = ctx.state.turn
  return true
}

// 'Once on your turn, bearer may deal 1 damage to target adjacent minion.'
registerScript('Bull Whip', {
  abilities: [{
    key: 'crack',
    label: 'Crack the whip (1 dmg adjacent minion)',
    cost: {},
    targets: [{ what: 'minion', count: 1, targeted: true, where: 'adjacent', label: 'target adjacent minion' }],
    effect: (ctx) => {
      if (!artOncePerTurn(ctx)) return ctx.log('Already used this turn.')
      const t = ctx.targets[0]
      // Proper use — cracking the whip at the Bull Demons of Adum
      if (t && 'unit' in t && ctx.state.units[t.unit]?.name === 'Bull Demons of Adum') awardAchievement(ctx.state, 'proper-use', ctx.controller)
      // Kink of the realm — a whip effect used on the King of the Realm
      if (t && 'unit' in t && ctx.state.units[t.unit]?.name === 'King of the Realm') awardAchievement(ctx.state, 'kink-of-realm', ctx.controller)
      // You kinky mf — a Daperyll Vampire is the one wielding the whip
      const bearer = ctx.state.artifacts[ctx.sourceId]?.carriedBy
      if (bearer && ctx.state.units[bearer]?.name === 'Daperyll Vampire') awardAchievement(ctx.state, 'kinky-mf', ctx.controller)
      ctx.dealDamage(t, 1)
    },
  }],
})
