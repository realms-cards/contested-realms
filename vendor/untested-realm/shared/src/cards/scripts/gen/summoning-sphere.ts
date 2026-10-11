import { registerScript } from '../registry'

// 'You may summon minions to affected sites.'
registerScript('Summoning Sphere', {
  auraAllowsSummon: (state, aura, player) => aura.controller === player,
})
