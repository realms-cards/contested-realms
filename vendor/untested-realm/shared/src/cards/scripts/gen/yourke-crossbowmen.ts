import { registerScript } from '../registry'

// 'Ranged / Takes no damage from ranged strikes.'
registerScript('Yourke Crossbowmen', {
  damagePreventer: true,
  damagePreviewPure: true,
  damageModifier: (state, selfId, victim, amount, source) =>
    victim.id === selfId && source?.kind === 'projectile' ? 0 : amount,
})
