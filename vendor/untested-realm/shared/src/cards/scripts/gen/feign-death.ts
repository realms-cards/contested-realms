import { registerScript } from '../registry'
import { getCard } from '../../db'
import { isDisabled } from '../../../engine/statics'
import { pushLog } from '../../../engine/effects'
import { getScript as require_script } from '../registry'

// "Trigger an allied minion's Deathrite. It gains Stealth. Draw a spell."
registerScript('Feign Death', {
  targets: [{ what: 'minion', count: 1, targeted: false, owner: 'ally', label: 'an allied minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    const script = getCard(u.name) && u.name ? require_script(u.name) : null
    if (script?.deathrite && !u.silenced && !isDisabled(ctx.state, u)) {
      pushLog(ctx.state, ctx.controller, `${u.name} plays dead — its Deathrite triggers!`)
      script.deathrite({ ...ctx, sourceId: u.id, controller: u.controller } as any)
    }
    if (ctx.state.units[u.id]) u.stealth = true
    ctx.draw(ctx.controller, 'spellbook')
  },
})
