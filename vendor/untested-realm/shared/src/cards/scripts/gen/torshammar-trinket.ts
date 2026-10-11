import { registerScript } from '../registry'

// 'Bearer has +1 power. After each turn, return this to its owner's hand.'
// The +1 power raises the bearer's effective DEFENCE too (a minion's power is its life),
// so a 1/1 with 1 damage survives WHILE carrying it. The return is a CLEANUP-phase effect
// (returnToHandAfterTurn) that fires AFTER end-of-turn damage is healed — so the bearer
// survives the turn instead of dying the instant the buff leaves (Torshammar FAQ).
registerScript('Torshammar Trinket', {
  artifactGrantsPower: (state, artifactId, unit) =>
    state.artifacts[artifactId]?.carriedBy === unit.id ? 1 : 0,
  returnToHandAfterTurn: true,
})
