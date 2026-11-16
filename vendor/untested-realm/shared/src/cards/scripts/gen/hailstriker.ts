import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { asAreaDamage, runDamageEvent } from '../../../engine/effects'
import { disableUntilYourNextTurn } from '../multi-card-utils/disable-until-next-turn'

// 'Ranged / Genesis → Target an adjacent location. Each minion there takes 1 damage and is disabled until
// your next turn.' (Ranged is a printed keyword.) The location is targeted, so it shares the Hailstriker's
// region. FAQ (Frostbolt, Hailstriker, When the Peaks Fell): the damage and the disable are simultaneous —
// damage-modifying statics (Shield Maidens, Royal Bodyguard) still apply, but a minion it kills fires no
// Deathrite. So the damage is dealt first (its deaths wait for the Genesis to finish) and every minion hit,
// dying ones included, is disabled before those deaths settle.
registerScript('Hailstriker', {
  // Genesis targets may be skipped (owner ruling), like every other targeted Genesis
  genesisTargets: [{ what: 'square', count: 1, upTo: true, targeted: true, where: 'adjacent', label: 'target adjacent location' }],
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    const t = ctx.targets[0]
    if (!self || !t || !('square' in t)) return
    const { x, y } = t.square
    const region = t.square.region ?? self.region
    const minions = unitsAt(ctx.state, x, y, region).filter((u) => !u.isAvatar)
    runDamageEvent(ctx.state, () => {
      asAreaDamage(ctx.state, () => {
        for (const u of minions) ctx.dealDamage({ unit: u.id }, 1)
      })
      for (const u of minions) disableUntilYourNextTurn(ctx, u.id, ctx.controller)
    })
    ctx.log('Hail hammers the location.')
  },
})
