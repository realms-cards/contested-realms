import { registerScript } from '../registry'

// "Lava Salamander: 'Takes no damage from fire spells.'" (plus its projectile
// interactions remain native)
registerScript('Lava Salamander', {
  damagePreventer: true,
  damagePreviewPure: true,
  damageModifier: (state, selfId, victim, amount, source) => {
    if (victim.id !== selfId) return amount
    return source.kind === 'magic' && source.elements?.includes('Fire') ? 0 : amount
  },
})
