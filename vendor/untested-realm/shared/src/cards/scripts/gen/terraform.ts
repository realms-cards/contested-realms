import { registerScript, getScript } from '../registry'
import { enterSite } from '../../../engine/casting'
import { GRID_H, siteAt } from '../../../engine/grid'

// 'Replace sites in this column with ones from the top of their controller's atlas, starting at your back
//  row going forwards.'
// "This column" is the caster's column. To replace a site is to banish it and immediately play another in
// its square (Codex, Replace: there's never a void there, and the new site's Genesis triggers as it's
// played). Each site is replaced by the top site of ITS controller's atlas, one square at a time from the
// caster's back row forwards. A Trap on top goes in face-down, unrevealed (FAQ; enterSite disguises it).
// If a site can't be replaced, nothing happens and it isn't banished (Codex, Replace): Rubble has no
// controller (so no atlas), a controller's atlas may be empty, or the top site's own placement rule may
// forbid that square (Edge of the World — it stays on top of the atlas).
registerScript('Terraform', {
  onCast: (ctx) => {
    const col = ctx.caster?.x ?? ctx.at?.x
    if (col === undefined) return
    const rows = Array.from({ length: GRID_H }, (_, i) => (ctx.controller === 0 ? i : GRID_H - 1 - i))
    let n = 0
    for (const y of rows) {
      const old = siteAt(ctx.state, col, y)
      if (!old || old.isRubble || old.controller === null) continue
      const who = old.controller
      const p = ctx.state.players[who]
      if (!p.atlas.length) continue
      const top = ctx.state.cards[p.atlas[0]].name
      if (getScript(top)?.sitePlacement?.(ctx.state, who, { x: col, y }) === 'deny') {
        // the top of an atlas is hidden information: don't name it
        ctx.log(`The top of ${p.name}'s atlas can't be played there — ${old.name} stays.`)
        continue
      }
      ctx.state.players[ctx.state.cards[old.cardId]?.owner ?? old.owner].banished.push(old.cardId)
      delete ctx.state.sites[old.id]
      const cardId = p.atlas.shift()!
      ctx.log(`${old.name} is banished and the land reshapes into a new site.`)
      enterSite(ctx.state, who, cardId, col, y)
      n++
    }
    if (!n) ctx.log('The land holds its shape.')
  },
})
