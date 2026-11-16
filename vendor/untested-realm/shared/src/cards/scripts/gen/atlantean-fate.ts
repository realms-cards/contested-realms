import { registerScript } from '../registry'
import { pushLog, applyFlood, notifySiteInterference, siteCantBeModified } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'
import { submergeOccupantsAt } from '../multi-card-utils/burrow-occupants'
import { siteRarity, terrainAt } from '../../../engine/statics'

// 'Affected non-Ordinary sites are flooded. They are water sites, only provide
//  Water threshold, and lose all other abilities. / Genesis → Submerge all
//  minions and artifacts atop affected sites.'
registerScript('Atlantean Fate', {
  // only NON-Ordinary sites are "affected" — an Ordinary site in the area is untouched (NOT silenced,
  // not water-limited). Rubble is Ordinary, so it's spared too (siteRarity).
  auraSilencesSites: (state, site) => siteRarity(state, site) !== 'Ordinary',
  auraLimitsToWaterThreshold: true,
  auraFloodsSite: (state, site) => siteRarity(state, site) !== 'Ordinary',
  genesis: (ctx) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (!aura) return
    // FAQ (Nov 2026): "lose all other abilities" IS a silence — so, exactly like a silencer site entering
    // (Smokestacks), a Vindictive Nation silenced by this very act still hears it ("as Vindictive Nation
    // becomes silenced, its ability triggers").
    const affected = new Set(aura.squares
      .map((sq) => siteAt(ctx.state, sq.x, sq.y))
      .filter((s): s is NonNullable<typeof s> => !!s && siteRarity(ctx.state, s) !== 'Ordinary' && !siteCantBeModified(ctx.state, s)) // Bedrock: unaffected
      .map((s) => s.id))
    for (const sq of aura.squares) {
      const site = siteAt(ctx.state, sq.x, sq.y)
      if (site && affected.has(site.id)) {
        applyFlood(ctx.state, site, ctx.controller, { aura: aura.id })
        // modifying an enemy's site is interference — but FAQ (Oct 2026): exactly ONE "modify" per site,
        // so a nearby Vindictive Nation exacts only 1 life per affected site (not once per sub-effect).
        notifySiteInterference(ctx.state, 'modify', { id: site.id, x: site.x, y: site.y, controller: site.controller }, ctx.controller, affected)
      }
      // FAQ: the Genesis submerges atop EVERY site in the area, Ordinary ones included — but only a
      // water site can be submerged into: an Ordinary land site stays dry, so what's atop it stays put
      if (!site || terrainAt(ctx.state, sq.x, sq.y) !== 'water') continue
      submergeOccupantsAt(ctx.state, sq.x, sq.y, ctx.controller) // minions with their cargo, and every artifact here
    }
    pushLog(ctx.state, null, 'The fate of Atlantis comes for these lands.')
  },
})
