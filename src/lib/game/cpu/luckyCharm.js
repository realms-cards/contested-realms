/** @param {import('./spellTypes').SpellState} state
 * @param {import('../store/types').PlayerKey} seat */
function luckyCharmCount(state,seat) {
  const owner = seat === 'p1' ? 1 : 2;
  return Object.entries(state.permanents).reduce((count,[at,items]) => count+items.filter((item,index) => {
    if (item.card.name !== 'Lucky Charm' || item.attachedTo?.at !== at) return false;
    if (items.some(token => token.card.name === 'Silenced' && token.attachedTo?.at === at && token.attachedTo.index === index)) return false;
    if (item.attachedTo.index === -1) return item.owner === owner && state.avatars[seat].pos?.join(',') === at;
    return items[item.attachedTo.index]?.owner === owner;
  }).length,0);
}
module.exports = {luckyCharmCount};
