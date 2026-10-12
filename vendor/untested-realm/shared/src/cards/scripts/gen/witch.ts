import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Tap → Curse target Avatar, choose one: Their spells cost (1) more to cast on
// their next turn, they lose 2 life, or they have -3 power until your next turn.'
registerScript('Witch', {
  abilities: [{
    key: 'curse',
    label: 'Curse target Avatar',
    cost: { tap: true },
    targets: [{ what: 'avatar', count: 1, targeted: true, label: 'target Avatar' }],
    effect: (ctx) => {
      const t = ctx.targets[0]
      if (!t || !('unit' in t)) return
      const victim = ctx.state.units[t.unit]
      if (!victim) return
      ctx.ask(
        { kind: 'chooseOption', title: `Curse ${victim.name} how?`, data: { options: ['spells cost ① more next turn', 'lose 2 life', '-3 power until your next turn'] } },
        'hex',
        { victimId: victim.id },
      )
    },
  }],
  conts: {
    hex: (ctx, c, choice) => {
      const victim = ctx.state.units[c.victimId as string]
      if (!victim || typeof choice !== 'string') return
      if (choice.startsWith('spells')) {
        ctx.state.flow = ctx.state.flow ?? {}
        ctx.state.flow.witchCurse = [...(ctx.state.flow.witchCurse ?? []), { player: victim.controller, turn: ctx.state.turn }]
        pushLog(ctx.state, ctx.controller, `${victim.name} is cursed: their spells cost ① more next turn.`)
      } else if (choice.startsWith('lose')) {
        ctx.loseLife(victim.controller, 2)
      } else {
        ctx.addPower(victim.id, -3, 'permanent')
        const m = victim.modifiers[victim.modifiers.length - 1]
        if (m) m.duration = 'untilYourNextTurn' as any
        pushLog(ctx.state, ctx.controller, `${victim.name} withers under the hex.`)
      }
    },
  },
})
