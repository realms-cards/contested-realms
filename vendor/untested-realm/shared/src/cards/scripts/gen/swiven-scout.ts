import { registerScript } from '../registry'
import { pushLog, revealHand } from '../../../engine/effects'
import { reachableLocations } from '../../../engine/movement'

// 'Movement +1 / Enemy Avatars within Swiven Scout's range of motion play with
//  their hands revealed.' — the reveal: each of the Scout's controller's turns,
//  log the exposed hand (the engine has no persistent reveal zone).
registerScript('Swiven Scout', {
  startOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const range = [{ x: self.x, y: self.y, region: self.region }, ...reachableLocations(ctx.state, self)]
    for (const u of Object.values(ctx.state.units)) {
      if (!u.isAvatar || u.controller === ctx.controller) continue
      if (!range.some((s) => s.x === u.x && s.y === u.y)) continue
      // reveal the hand to the Scout's controller only (viewFor un-hides it);
      // do NOT print the card names into the shared log — that would leak them
      revealHand(ctx.state, u.controller, ctx.controller)
      pushLog(ctx.state, ctx.controller, `🔭 The Scout spies ${ctx.state.players[u.controller].name}'s hand.`)
    }
  },
})
