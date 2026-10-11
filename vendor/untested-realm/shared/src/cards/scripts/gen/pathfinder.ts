import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { enterSite } from '../../../engine/casting'
import { siteAt, orthAdjacentWrapped } from '../../../engine/grid'
import { isLegalStep } from '../../../engine/movement'

// "Your atlas can't contain duplicates. Draw no sites during setup. /
//  Tap → If able, play the topmost site of your atlas to an adjacent location
//  and move there."
registerScript('Pathfinder', {
  setupDraw: { sites: 0 },
  atlasNoDuplicates: true,
  noStandardSiteAction: true, // plays sites only via its own topmost-site tap (below)
  abilities: [{
    key: 'blaze',
    label: 'Play topmost atlas site adjacent & move there',
    cost: { tap: true },
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      const p = ctx.state.players[ctx.controller]
      if (!self || !p.atlas.length) return
      // adjacency wraps around the board under Magellan Globe, like every other adjacency effect.
      // A trail may be blazed into a bare VOID or over an adjacent RUBBLE (a destroyed site is
      // replaced, exactly as a normal site play does — one site per square).
      const spots = orthAdjacentWrapped(ctx.state, self.x, self.y).filter((s) => {
        const site = siteAt(ctx.state, s.x, s.y)
        return !site || site.isRubble
      })
      if (!spots.length) return ctx.log('No adjacent void or rubble to blaze a trail into.')
      // the topmost atlas site is face-down — don't spoil its name in the prompt
      ctx.ask({ kind: 'chooseSquare', title: 'Blaze a trail — play your topmost site where?', data: { squares: spots } }, 'blaze')
    },
  }],
  conts: {
    blaze: (ctx, _c, sq) => {
      const self = ctx.state.units[ctx.sourceId]
      const p = ctx.state.players[ctx.controller]
      const existing = sq ? siteAt(ctx.state, sq.x, sq.y) : null
      // legal target: an empty void, or an adjacent rubble to build over — never an intact site
      if (!self || !sq || !p.atlas.length || (existing && !existing.isRubble)) return
      // the chosen square must be one Pathfinder can actually reach (Magellan-wrap aware)
      if (!orthAdjacentWrapped(ctx.state, self.x, self.y).some((s) => s.x === sq.x && s.y === sq.y)) return
      const cardId = p.atlas.shift()!
      // build over any rubble first (one site per square), exactly as playSite does
      if (existing?.isRubble) delete ctx.state.sites[existing.id]
      // route through enterSite so the played site's Genesis (and its mana/ward/onSitePlayed)
      // fire, exactly as a normal site play would — previously the site was inserted raw and
      // its Genesis never triggered (Den of Evil, Pond, etc. did nothing when Pathfinder laid them).
      pushLog(ctx.state, ctx.controller, `Pathfinder blazes a trail: ${ctx.state.cards[cardId].name}.`)
      enterSite(ctx.state, ctx.controller, cardId, sq.x, sq.y)
      // FAQ: the site is ALWAYS played, but the Pathfinder only moves onto it if it legally can.
      // If something stops the move — it's trapped where it stands (Sphere of Animosity), or the
      // just-played site immediately immobilizes it (Quagmire makes nearby-site occupants Immobile)
      // — the site stays in play and the Pathfinder stays put. Both cases fall out of isLegalStep,
      // evaluated AFTER enterSite so the new site's Genesis (e.g. Quagmire) has already resolved.
      const from = { x: self.x, y: self.y, region: 'surface' as const }
      const to = { x: sq.x, y: sq.y, region: 'surface' as const }
      if (isLegalStep(ctx.state, self, from, to)) ctx.teleport(self.id, sq.x, sq.y, 'surface')
      else pushLog(ctx.state, ctx.controller, `Pathfinder can't advance onto the new site and holds its ground.`)
    },
  },
})
