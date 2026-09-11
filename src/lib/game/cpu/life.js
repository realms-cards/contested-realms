// Shared by the CPU client and the human's CPU-match store. Keep tabletop
// (human versus human) life adjustments independent of these enforced rules.
/**
 * @typedef {{ life: number, lifeState: 'alive' | 'dd' | 'dead', deathsDoorTurn?: string }} Life
 */

/** @param {number} turn @param {number} currentPlayer */
function lifeTurnKey(turn, currentPlayer) {
  return `${turn}:${currentPlayer}`;
}

/**
 * Rulebook: Death's Door & Death Blow; Attacking the Surface of an Enemy Site.
 * Life loss can put an avatar at death's door, but only direct damage on a
 * subsequent turn can deliver the death blow. Healing cannot reverse death's door.
 * @param {Life} player
 * @param {number} delta
 * @param {boolean} directDamage
 * @param {string} turnKey
 * @param {number} [maximumLife]
 * @returns {Life}
 */
function changeLife(player, delta, directDamage, turnKey, maximumLife = 20) {
  if (!Number.isFinite(delta) || delta === 0 || player.lifeState === 'dead') return { ...player };
  if (player.lifeState === 'dd') {
    return {
      ...player,
      life: 0,
      lifeState: delta < 0 && directDamage && player.deathsDoorTurn !== turnKey ? 'dead' : 'dd',
    };
  }
  const life = Math.min(maximumLife, Math.max(0, player.life + delta));
  if (life === 0) return { ...player, life, lifeState: 'dd', deathsDoorTurn: turnKey };
  return { ...player, life, lifeState: 'alive' };
}

module.exports = { changeLife, lifeTurnKey };
