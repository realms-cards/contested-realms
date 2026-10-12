import { registerScript } from '../registry'

// 'Choose an allied minion. The next time they strike a unit this turn, the
// damage heals you. Draw a spell.'
// Unlike Wolf/Serpent's passive "Give an allied minion X" grant, this one says "CHOOSE an allied
// minion" — a mandatory selection you can't make with none, so it requires an allied minion (not
// castable just to draw). Still non-targeting (no "target" keyword).
registerScript('Gift of the Raven', {
  targets: [{ what: 'minion', count: 1, targeted: false, owner: 'ally', label: 'an allied minion' }],
  onCast: (ctx) => {
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.strikeFlags = [...(ctx.state.flow.strikeFlags ?? []), { player: ctx.controller, type: 'lifelink' }]
    ctx.draw(ctx.controller, 'spellbook')
  },
})
