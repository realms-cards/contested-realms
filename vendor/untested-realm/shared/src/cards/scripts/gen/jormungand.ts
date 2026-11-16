import { registerScript } from '../registry'
import { GRID_H, GRID_W } from '../../../engine/grid'

const isOuter = (x: number, y: number) => x === 0 || y === 0 || x === GRID_W - 1 || y === GRID_H - 1

// 'Occupies all outer locations safely, and can't be modified.'
// The outer squares are the realm's ring (Codex, Outerbound: a square with fewer than four other adjacent
// squares — the card's own diagram dots the 14 edge squares of the 5x4 realm). Like Yog-Sothoth's
// "occupies all locations safely", the footprint is a characteristic applied by checkStateBased from the
// name (occupiesAllLocations.outer), and "safely" means no region harms it — void, underground or
// underwater — and it can't move itself (Codex, Burrowed Safely: "can't move itself"). Its footprint takes
// in at least one site of yours only if it's cast to one of your outer sites, so that's where it's summoned.
// "Can't be modified": no disable, silence, transform, external power or keyword (isUnmodifiable).
registerScript('Jormungand', {
  unmodifiable: true,
  occupiesAllLocations: { outer: true },
  selfKeywords: () => ['voidwalk', 'submerge', 'burrowing', 'immobile'],
  summonFilter: (_state, _player, at) => (isOuter(at.x, at.y) ? null : 'Jormungand girds the realm — summon it to one of your outer sites.'),
})
