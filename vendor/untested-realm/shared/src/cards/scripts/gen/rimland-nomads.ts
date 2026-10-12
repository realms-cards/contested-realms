import { registerScript } from '../registry'

// 'Takes no damage from Deserts.' (Rimland Nomads — desert sites' Genesis damage)
registerScript('Rimland Nomads', {
  damagePreventer: true,
  damagePreviewPure: true,
  damageModifier: (state, selfId, victim, amount, source) => {
    if (victim.id !== selfId) return amount
    return source.name?.includes('Desert') ? 0 : amount
  },
})
