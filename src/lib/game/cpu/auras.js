/** Shared aura footprint semantics. The drop handler stores 2x2 auras at
 * their minimum-x/minimum-y anchor, with a visual offset to the intersection. */
/** @param {import('../store/types').Permanents} permanents @param {string} at @param {string} name */
function affectedByAura(permanents, at, name) {
  const [x,y] = at.split(',').map(Number);
  for (const [anchor,items] of Object.entries(permanents || {})) {
    const [ax,ay] = anchor.split(',').map(Number);
    if (x<ax || x>ax+1 || y<ay || y>ay+1) continue;
    if (items.some((item,index) => item.card.name === name && !items.some(token =>
      token.card.name === 'Silenced' && token.attachedTo?.at === anchor && token.attachedTo.index === index))) return true;
  }
  return false;
}
module.exports = { affectedByAura };
