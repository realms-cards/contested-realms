import { registerScript } from '../registry'
import { inBounds, siteAt, unitsAt } from '../../../engine/grid'
import { checkStateBased, emitUnitMoved } from '../../../engine/effects'
import { isLegalStep } from '../../../engine/movement'
import { strikeOnce } from '../multi-card-utils/strike-once'

// 'Tap â†’ Move three steps in a cardinal direction. When Bull Demons of Adum enter
// each location, they strike each untapped unit there.'
registerScript('Bull Demons of Adum', {
  abilities: [{
    key: 'rampage',
    label: 'Tap â†’ Rampage 3 steps in a direction',
    cost: { tap: true },
    effect: (ctx) => {
      ctx.ask({ kind: 'chooseOption', title: 'Rampage in which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'go')
    },
  }],
  conts: {
    go: (ctx, _c, dir) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const dx = dir === 'e' ? 1 : dir === 'w' ? -1 : 0
      const dy = dir === 'n' ? 1 : dir === 's' ? -1 : 0
      for (let i = 0; i < 3; i++) {
        const from = { x: self.x, y: self.y, region: self.region }
        const to = { x: self.x + dx, y: self.y + dy, region: self.region }
        if (!inBounds(to.x, to.y) || !siteAt(ctx.state, to.x, to.y)) break
        // each of the three steps is a real STEP — a wall / entry-ban / Immobile stops the rampage there
        if (!isLegalStep(ctx.state, self, from, to)) break
        self.x = to.x
        self.y = to.y
        emitUnitMoved(ctx.state, self, from) // "enter each location" — fire on-enter triggers
        if (!ctx.state.units[self.id]) return // an on-enter trigger felled it
        for (const u of unitsAt(ctx.state, to.x, to.y, self.region)) {
          if (u.id !== self.id && !u.tapped) strikeOnce(ctx, self, u.id)
        }
        if (!ctx.state.units[self.id]) return // died mid-rampage somehow
      }
      checkStateBased(ctx.state)
    },
  },
})
