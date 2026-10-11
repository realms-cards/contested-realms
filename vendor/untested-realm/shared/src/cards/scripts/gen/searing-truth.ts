import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog, opponent, revealCards } from '../../../engine/effects'

// 'Target player draws and reveals two spells, then takes damage equal to the
//  higher mana cost.'
registerScript('Searing Truth', {
  onCast: (ctx) => {
    ctx.ask({ kind: 'chooseOption', title: 'Sear whom with truth?', data: { options: ['you', 'your opponent'] } }, 'sear')
  },
  conts: {
    sear: (ctx, _c, choice) => {
      const who = choice === 'you' ? ctx.controller : opponent(ctx.controller)
      const p = ctx.state.players[who]
      const before = p.hand.length
      ctx.draw(who, 'spellbook', 2)
      const drawn = p.hand.slice(before)
      const names = drawn.map((id) => ctx.state.cards[id].name)
      revealCards(ctx.state, who, names) // both spells are drawn (never summoned) → reveal them
      const dmg = Math.max(0, ...names.map((n) => getCard(n).cost ?? 0))
      pushLog(ctx.state, null, `Revealed: ${names.join(', ') || 'nothing'} — the truth burns for ${dmg}.`)
      const avatar = Object.values(ctx.state.units).find((u) => u.isAvatar && u.controller === who)
      if (avatar && dmg > 0) ctx.dealDamage({ unit: avatar.id }, dmg)
    },
  },
})
