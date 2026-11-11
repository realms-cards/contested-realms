import { registerScript } from '../registry'
import { siteAt, unitsAt } from '../../../engine/grid'
import { breakStealthAbility } from '../multi-card-utils/break-stealth'

// 'Stealth / Break Stealth → Destroy everything else here, including this site.'
registerScript('Asmodeus', {
  abilities: [breakStealthAbility('immolate', 'Destroy everything here', (ctx, self) => {
    // "everything else here" is Asmodeus's OWN location (its region) — the surface layer if he's atop
    // the site, like Year of the Blaze. A burrowed/submerged minion under the site isn't consumed (it
    // only contends with the site being destroyed via normal state-based rules).
    for (const u of unitsAt(ctx.state, self.x, self.y, self.region)) {
      if (u.id !== self.id && !u.isAvatar) ctx.kill(u.id)
    }
    for (const a of Object.values(ctx.state.artifacts)) {
      if (a.x === self.x && a.y === self.y && a.region === self.region) ctx.breakArtifact(a.id)
    }
    const site = siteAt(ctx.state, self.x, self.y)
    if (site) ctx.destroySite(site.id)
  })],
})
