import { registerScript } from '../registry'
import { pushLog, killUnit, checkStateBased } from '../../../engine/effects'
import { nearbySquaresW } from '../../../engine/grid'

// 'When a unit kills Accursed Albatross, kill that unit's other allied minions
//  it's nearby.'
registerScript('Accursed Albatross', {
  deathrite: (ctx) => {
    // whoever got kill CREDIT (unified system): a striker, an ability-damager, a Magic caster, or an
    // activator. `killerByVictim` is a per-victim list of position SNAPSHOTS — so a killer that DIED
    // in the same trade (Redbreast Robin eating the Albatross's retaliation) still curses its allies.
    const killers: { id: string; x: number; y: number; controller: number }[] = ctx.state.flow?.killerByVictim?.[ctx.sourceId] ?? []
    for (const killer of killers) {
      for (const u of Object.values(ctx.state.units)) {
        if (u.isAvatar || u.id === killer.id || u.controller !== killer.controller) continue
        if (nearbySquaresW(ctx.state, killer.x, killer.y).some((s) => s.x === u.x && s.y === u.y)) {
          pushLog(ctx.state, null, `The albatross's curse claims ${u.name}!`)
          killUnit(ctx.state, u.id)
        }
      }
    }
    checkStateBased(ctx.state)
  },
})
