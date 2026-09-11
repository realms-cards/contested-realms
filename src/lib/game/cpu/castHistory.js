// Called only by committed cast actions, never by realm-entry or state echoes.
/** @param {Pick<import('./spellTypes').SpellState,'avatars'|'turn'|'currentPlayer'>} state
 * @param {import('../store/types').PlayerKey} seat
 * @param {import('../store/types').CardRef} card */
function recordAirCast(state,seat,card) {
  if (!['Minion','Magic','Aura','Artifact'].includes(card.type)) return null;
  const air = Number(card.thresholds?.air || 0);
  if (!Number.isFinite(air) || air<=0) return null;
  const turn = `${state.turn}:${state.currentPlayer}`;
  const previous = state.avatars[seat]?.cpuAirCast;
  return {turn,air:air+(previous?.turn === turn ? previous.air : 0)};
}
module.exports = {recordAirCast};
