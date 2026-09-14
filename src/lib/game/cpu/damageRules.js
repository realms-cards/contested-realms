/**
 * Pure damage replacements shared by projectile planning and adjudication.
 * @param {{name: string, damage: number, defence: number, damagePreventedTurn?: string | null, avatar?: boolean}} unit
 * @param {import('./spellTypes').DamageHit[]} hits
 * @param {string} turn
 */
function evaluateDamage(unit, hits, turn) {
  let damage = 0, power = 0, lethal = false;
  for (const hit of hits) {
    if (hit.amount <= 0) continue;
    if (unit.name === 'Rimland Nomads' && /Desert/.test(hit.sourceName || '')) continue;
    if (unit.name === 'Lava Salamander' && hit.element === 'fire' && hit.sourcePower === undefined) continue;
    if (unit.name === 'Sling Pixies' && (hit.sourcePower ?? 0) >= 4) continue;
    if (unit.name === 'Yourke Crossbowmen' && hit.ranged) continue;
    if (unit.name === 'Askelon Phoenix' && hit.element === 'fire') { power++; continue; }
    damage += hit.amount;
    lethal ||= hit.lethal === true;
  }
  const prevented = damage > 0 && unit.name === 'Tufted Turtles' && unit.damagePreventedTurn !== turn;
  if (prevented) damage = 0;
  const totalDamage = unit.damage+damage;
  const killed = !unit.avatar && damage > 0 && (lethal || totalDamage >= unit.defence+power);
  return { damage, power, killed, prevented,
    remainingDamage: unit.name === 'Seirawan Hydra' && !killed ? 0 : totalDamage };
}

module.exports = { evaluateDamage };
