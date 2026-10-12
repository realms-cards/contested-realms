import { registerScript } from '../registry'
import type { PlayerId } from '../../../engine/types'

// 'Genesis → Heal 3. / (3) → Draw a spell. / Deathrite → Opponent loses 3 life.'
registerScript('Maiden, Mother, Crone', {
  genesis: (ctx) => ctx.gainLife(ctx.controller, 3),
  abilities: [{
    key: 'crone',
    label: '③ → Draw a spell',
    cost: { mana: 3 },
    usableFromCemetery: true, // just draws a spell (mana cost, no tap, no position) → usable from the grave
    effect: (ctx) => ctx.draw(ctx.controller, 'spellbook'),
  }],
  deathrite: (ctx) => ctx.loseLife((1 - ctx.controller) as PlayerId, 3),
})
