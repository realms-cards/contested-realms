import { registerScript } from '../registry'

// 'Movement +1 / Takes no damage while attacking.'
// Movement +1 is printed. "While attacking" = from declaring its attack until that battle ends
// (flow.attackingUnitId, combat.ts) — the defenders' strikes and any "when attacked" reaction alike.
// A plain fight (an intercept) is no attack. A prevention, so the engine skips it while silenced/disabled.
registerScript('Dust Devil', {
  damagePreventer: true,
  damagePreviewPure: true,
  damageModifier: (state, selfId, victim, amount) =>
    victim.id === selfId && state.flow?.attackingUnitId === selfId ? 0 : amount,
})
