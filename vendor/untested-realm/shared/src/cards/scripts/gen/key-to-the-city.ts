import { registerScript } from '../registry'

// 'Provides (1). / Bearer ignores site abilities.'
// Codex (Oct 2026): "ignores site abilities" = the bearer is Protected from Sites — no site ability
// may grant it anything, filter its movement, or target/damage/banish/move it on entry. The engine
// enforces this via protectedFromSites() (statics.ts): keyword/power grants, entry filters, and site
// enter-triggers (Bottomless Pit, Dark Alley, a flipped-Druid site's thorns) all skip the bearer.
registerScript('Key to the City', {
  extraManaEachTurn: 1,
  bearerIgnoresSites: true,
})
