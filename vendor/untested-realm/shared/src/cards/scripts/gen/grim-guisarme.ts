import { registerScript } from '../registry'

// 'UPDATED: Bearer takes and deals double strike damage against units.'
registerScript('Grim Guisarme', {
  damageModifierKind: 'mul',
  bearerStrikeMultiplier: 2,
  damageModifier: (state, selfId, victim, amount, source) => {
    const art = state.artifacts[selfId]
    if (!art || art.carriedBy !== victim.id) return amount
    // "double STRIKE damage" — a ranged strike (the Ranged keyword) IS a strike, so it doubles too.
    return source.kind === 'strike' || source.rangedStrike ? amount * 2 : amount
  },
})
