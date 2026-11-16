import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'
import { protectedFromNonUnits } from '../../../engine/statics'

// 'Minions and artifacts atop affected sites are disabled.' The usual 2×2 aura area (no pattern is
// printed). "Atop" a site is its surface: a burrowed or submerged minion beneath it is untouched, and a
// void square has no site. A disabled artifact has no abilities (codex), so covered artifacts — on the
// ground or carried by a unit atop the site — lose their text like a silenced one (artScript); automatons
// are minions and are disabled outright. A unit Protected from all but units (Humming Hummocks) ignores it.
// (Rubble is a site too — codex)
const atopAffectedSite = (state: Parameters<typeof siteAt>[0], x: number, y: number, region: string | undefined): boolean =>
  (region ?? 'surface') === 'surface' && !!siteAt(state, x, y)

registerScript('Man-made Ice Age', {
  auraDisablesUnit: (state, aura, unit) => {
    if (unit.isAvatar || !aura.squares.some((q) => q.x === unit.x && q.y === unit.y)) return false
    return atopAffectedSite(state, unit.x, unit.y, unit.region) && !protectedFromNonUnits(state, unit)
  },
  auraSilencesArtifacts: (state, art) => {
    const bearer = art.carriedBy ? state.units[art.carriedBy] : undefined
    const x = bearer?.x ?? art.x
    const y = bearer?.y ?? art.y
    return atopAffectedSite(state, x, y, bearer?.region ?? art.region)
  },
})
