import { registerScript } from '../registry'
import type { PlayerId } from '../../../engine/types'

// 'Genesis → Banish two identical spells from cemeteries to draw a spell.'
registerScript('Sphinx Sarcophagus', {
  genesis: (ctx) => {
    const all: { id: string; name: string; owner: PlayerId }[] = []
    for (const p of ctx.state.players) for (const id of p.cemetery) all.push({ id, name: ctx.state.cards[id].name, owner: p.id })
    const byName = new Map<string, typeof all>()
    for (const c of all) byName.set(c.name, [...(byName.get(c.name) ?? []), c])
    const pairs = [...byName.entries()].filter(([, v]) => v.length >= 2).map(([n]) => n)
    if (!pairs.length) return
    ctx.ask({ kind: 'chooseOption', title: 'Banish which pair of identical spells?', data: { options: [...pairs, '(none)'] } }, 'pair')
  },
  conts: {
    pair: (ctx, _c, choice) => {
      if (typeof choice !== 'string' || choice === '(none)') return
      let banished = 0
      for (const p of ctx.state.players) {
        while (banished < 2) {
          const at = p.cemetery.findIndex((id) => ctx.state.cards[id].name === choice)
          if (at < 0) break
          p.banished.push(p.cemetery.splice(at, 1)[0])
          banished++
        }
      }
      if (banished === 2) ctx.draw(ctx.controller, 'spellbook')
    },
  },
})
