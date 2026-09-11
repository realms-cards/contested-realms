/**
 * Produce an identity-preserving movement patch, including carried artifacts
 * and tokens. Source tombstones are required by the multiplayer delta protocol.
 * @param {import('./spellTypes').SpellState} state
 * @param {string} from @param {number} index @param {string} to
 */
function moveUnit(state, from, index, to) {
  const source = state.permanents[from] || [];
  const unit = source[index];
  if (!unit) return null;
  const tapped = { ...unit, tapped: true, tapVersion: (unit.tapVersion || 0) + 1, version: (unit.version || 0) + 1 };
  if (from === to) {
    const items = [...source]; items[index] = tapped;
    return { index, patch: { permanents: { [from]: items } } };
  }
  const moving = new Set([index]);
  for (let pass = 0; pass < source.length; pass++) {
    source.forEach((item, i) => {
      if (item.attachedTo?.at === from && moving.has(item.attachedTo.index)) moving.add(i);
    });
  }
  const indices = [...moving].sort((a,b) => a-b);
  const destination = [...(state.permanents[to] || [])];
  const destinationIndex = new Map(indices.map((i,n) => [i, destination.length+n]));
  const remainingIndices = source.map((_,i) => i).filter(i => !moving.has(i));
  const sourceIndex = new Map(remainingIndices.map((i,n) => [i,n]));
  const remaining = remainingIndices.map(i => {
    const item = source[i];
    if (item.attachedTo?.at !== from) return item;
    return { ...item, version: (item.version || 0)+1,
      attachedTo: { at: from, index: sourceIndex.get(item.attachedTo.index) } };
  });
  const positions = {};
  const [x,z] = to.split(',').map(Number);
  for (const i of indices) {
    const original = source[i];
    const item = i === index ? tapped : { ...original, version: (original.version || 0)+1 };
    if (i === index) item.cpuPlanarVoidwalk = !state.board?.sites?.[to]?.card &&
      (state.board?.sites?.[from]?.card?.name === 'Planar Gate' || original.cpuPlanarVoidwalk === true);
    if (item.attachedTo?.at === from) item.attachedTo = { at: to, index: destinationIndex.get(item.attachedTo.index) };
    destination.push(item);
    const id = item.instanceId || item.card.instanceId;
    if (id && state.permanentPositions?.[id]) {
      const previous = state.permanentPositions[id];
      positions[id] = { ...previous, position: { ...previous.position, x, z } };
    }
  }
  return { index: destinationIndex.get(index), patch: {
    permanents: { [from]: [...remaining, ...indices.map(i => ({ instanceId: source[i].instanceId || source[i].card.instanceId, __remove: true }))],
      [to]: destination }, permanentPositions: positions,
  } };
}

/** @param {Record<string, object[]>} base @param {Record<string, object[]>} patch */
function mergePermanents(base, patch) {
  const result = { ...base };
  for (const [at, entries] of Object.entries(patch)) {
    if (!Array.isArray(entries) || !entries.length) { result[at] = []; continue; }
    const current = [...(result[at] || [])];
    for (const entry of entries) {
      const id = entry.instanceId || entry.card?.instanceId;
      const index = id ? current.findIndex(item => (item.instanceId || item.card?.instanceId) === id) : -1;
      if (entry.__remove) { if (index >= 0) current.splice(index,1); continue; }
      if (index < 0) { if (entry.card) current.push(entry); continue; }
      const previous = current[index], next = { ...previous, ...entry };
      if (Number(entry.tapVersion ?? -1) < Number(previous.tapVersion || 0)) {
        next.tapped = previous.tapped; next.tapVersion = previous.tapVersion;
      }
      if (Number(entry.version ?? previous.version ?? 0) < Number(previous.version || 0)) continue;
      current[index] = next;
    }
    result[at] = current;
  }
  return result;
}

module.exports = { moveUnit, mergePermanents };
