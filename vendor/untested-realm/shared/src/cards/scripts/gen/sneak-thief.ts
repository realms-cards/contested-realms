import { registerScript, type EffectAPI } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Stealth / Tap → Steal an artifact out of the hands of another target unit
//  here, and stay Stealthed.'
registerScript('Sneak Thief', {
  abilities: [{
    key: 'steal',
    label: 'Steal an artifact from a unit here',
    cost: { tap: true },
    targets: [{ what: 'unit', count: 1, targeted: true, where: 'here', label: 'target unit here' }],
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      const t = ctx.targets[0]
      if (!self || !t || !('unit' in t)) return
      const mark = ctx.state.units[t.unit]
      if (!mark || !mark.carrying.length) return ctx.log('Nothing to steal.')
      const arts = mark.carrying.filter((id) => ctx.state.artifacts[id])
      if (!arts.length) return ctx.log('Nothing to steal.')
      if (arts.length === 1) return sneakSteal(ctx, mark.id, arts[0])
      // several artifacts carried → the thief chooses which one to lift
      ctx.ask(
        { kind: 'chooseCards', title: 'Steal which artifact?', data: { cards: arts.map((id) => ctx.state.artifacts[id]?.name ?? '?'), pick: 1, upTo: false } },
        'steal',
        { markId: mark.id, artIds: arts },
      )
    },
  }],
  conts: {
    steal: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      const artIds = c.artIds as string[]
      if (typeof idx !== 'number' || idx < 0 || idx >= artIds.length) return
      sneakSteal(ctx, c.markId as string, artIds[idx])
    },
  },
})

// transfer `artId` from `mark` into the Sneak Thief's hands; stays stealthed.
function sneakSteal(ctx: EffectAPI, markId: string, artId: string) {
  const self = ctx.state.units[ctx.sourceId]
  const mark = ctx.state.units[markId]
  const art = ctx.state.artifacts[artId]
  if (!self || !mark || !art) return
  mark.carrying = mark.carrying.filter((id) => id !== artId)
  art.carriedBy = self.id
  art.x = self.x
  art.y = self.y
  self.carrying.push(artId)
  self.stealth = true // stays stealthed
  pushLog(ctx.state, ctx.controller, `The Sneak Thief lifts ${art.name} unseen.`)
}
