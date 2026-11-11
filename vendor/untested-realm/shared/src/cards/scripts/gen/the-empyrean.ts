import { registerScript } from '../registry'
import type { GameState, PlayerId } from '../../../engine/types'
import { nearbySquaresW, unitsAt, siteAt } from '../../../engine/grid'
import { effSubtypes, siteSilenced } from '../../../engine/statics'

// 'Provides (A)(E)(F)(W) if you control a nearby Angel or Ward.' — the condition switches only the
// (A)(E)(F)(W) its text adds; the site's 1 mana is a basic characteristic and always there. "A Ward" is a
// Ward on a card you control: a unit's or a nearby site's (Codex Ally: "allied Ward" = "a Ward on card
// you control"). A silenced Empyrean has no text, so it adds no threshold.
registerScript('The Empyrean', {
  siteExtraThreshold: (state, site) => {
    if (site.controller === null || siteSilenced(state, site) || !empyreanBlessed(state, site)) return {}
    return { air: 1, earth: 1, fire: 1, water: 1 }
  },
})

function empyreanBlessed(state: GameState, site: { x: number; y: number; controller: PlayerId | null }): boolean {
  for (const sq of nearbySquaresW(state, site.x, site.y)) {
    const s = siteAt(state, sq.x, sq.y)
    if (s && s.controller === site.controller && s.ward) return true
    for (const u of unitsAt(state, sq.x, sq.y)) {
      if (u.controller !== site.controller) continue
      if (u.ward || effSubtypes(state, u).includes('Angel')) return true
    }
  }
  return false
}
