import { registerScript } from '../registry'

// 'Summon a Frog token to an allied minion. Draw a spell.'
// Unlike the other Gifts, this one REQUIRES an allied minion: the Frog token is summoned TO
// (at) that minion's location, so with no minion there's no anchor to create it. The minion is
// therefore a mandatory choice — you can't cast it with none just to draw.
registerScript('Gift of the Frog', {
  targets: [{ what: 'minion', count: 1, targeted: false, owner: 'ally', label: 'an allied minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (t && 'unit' in t) {
      const u = ctx.state.units[t.unit]
      if (u) ctx.summonToken('Frog', ctx.controller, u.x, u.y, u.region)
    }
    ctx.draw(ctx.controller, 'spellbook')
  },
})
