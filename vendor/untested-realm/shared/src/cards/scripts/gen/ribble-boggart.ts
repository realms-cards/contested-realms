import { registerScript, type EffectAPI } from '../registry'
import { pushLog, luckyChoiceIndex } from '../../../engine/effects'

// 'At the start of your turn, Boggart gains a random mutation until the end of
//  turn: Airborne, Ranged, Lethal, or +3 power.'
registerScript('Ribble Boggart', {
  startOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const names = ['Airborne', 'Ranged', 'Lethal', '+3 power']
    // the random mutation → Kythera/Black Cat (choose any) or Lucky Charm (roll N+1, choose)
    const pick = ctx.lucky(names.map((n, i) => ({ label: n, payload: i })), 'mutate')
    if (pick !== undefined) ribbleMutate(ctx, pick as number)
  },
  conts: {
    mutate: (ctx, c, choice) => ribbleMutate(ctx, (c.__opts as number[])[luckyChoiceIndex(c, choice)]),
  },
})

function ribbleMutate(ctx: EffectAPI, roll: number): void {
  const self = ctx.state.units[ctx.sourceId]
  if (!self) return
  const names = ['Airborne', 'Ranged', 'Lethal', '+3 power']
  pushLog(ctx.state, ctx.controller, `The Boggart writhes — today it is ${names[roll]}!`)
  if (roll === 3) ctx.addPower(self.id, 3, 'endOfTurn')
  else ctx.grantKeyword(self.id, names[roll].toLowerCase(), 'endOfTurn')
}
