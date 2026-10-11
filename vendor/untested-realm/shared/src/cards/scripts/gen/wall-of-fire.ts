import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { raiseCont, wallGenesis, wallPlacement } from '../multi-card-utils/wall-build'

// 'Whenever a unit passes through Wall of Fire, it takes 3 damage.'
registerScript('Wall of Fire', {
  auraPlacement: wallPlacement,
  edgeAura: true,
  genesis: wallGenesis('Wall of Fire'),
  conts: { raise: raiseCont },
  wallOnCross: (ctx, _aura, unit) => {
    pushLog(ctx.state, ctx.controller, `${unit.name} plunges through the Wall of Fire!`)
    ctx.dealDamage({ unit: unit.id }, 3)
  },
})
