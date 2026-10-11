import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { effKeywords } from '../../../engine/statics'
import { raiseCont, wallGenesis, wallPlacement } from '../multi-card-utils/wall-build'

// 'Whenever an enemy traverses this wall on the ground, it takes 2 damage.'
registerScript('Wall of Brambles', {
  auraPlacement: wallPlacement,
  edgeAura: true,
  genesis: wallGenesis('Wall of Brambles'),
  conts: { raise: raiseCont },
  wallOnCross: (ctx, aura, unit) => {
    if (unit.controller === aura.controller) return
    if (effKeywords(ctx.state, unit).airborne) return // over, not through
    pushLog(ctx.state, ctx.controller, `${unit.name} tears through the brambles!`)
    ctx.dealDamage({ unit: unit.id }, 2)
  },
})
