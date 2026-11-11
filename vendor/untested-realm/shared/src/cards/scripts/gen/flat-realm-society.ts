import { registerScript } from '../registry'

// 'Stealth / Edges of the realm can't be connected, crossed, or shifted.'
// While it's in the realm with its abilities: Magellan Globe connects nothing (edgesConnected), no unit
// moves across the top/bottom edge (topBottomWrapStepsFor: Polar Bears, Polar Explorers, Ruler of Thul; Aino),
// and Polar Shift can't shift the realm — all through grid.realmIsFlat.
registerScript('Flat Realm Society', {
  flattensRealm: true,
})
