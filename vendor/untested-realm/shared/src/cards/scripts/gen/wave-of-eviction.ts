import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog, applyFlood } from '../../../engine/effects'
import { inBounds, isWaterSite, siteAt, unitsAt } from '../../../engine/grid'

// 'An allied water site overflows in a cardinal direction, flooding sites there
//  this turn and carrying away enemies one step at a time.'
registerScript('Wave of Eviction', {
  targets: [{
    what: 'site', count: 1, targeted: false, owner: 'ally', label: 'an allied water site',
    filter: (state, s) => isWaterSite(state, s, getCard),
  }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('site' in t)) return
    const site = ctx.state.sites[t.site]
    if (!site) return
    // standard cardinal-direction picker (options 'n'/'s'/'e'/'w') — the client automatically draws the
    // conveyor-belt preview, and `from` anchors it at the overflowing water site.
    ctx.ask({ kind: 'chooseOption', title: 'The wave surges in which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'surge', { x: site.x, y: site.y, from: { x: site.x, y: site.y } })
  },
  conts: {
    surge: (ctx, c, choice) => {
      if (typeof choice !== 'string') return
      const dx = choice === 'e' ? 1 : choice === 'w' ? -1 : 0
      const dy = choice === 'n' ? 1 : choice === 's' ? -1 : 0
      // The wave starts AT the origin water site itself (so its enemies are carried too) and flows in
      // the chosen direction one square at a time, flooding each SITE it reaches and shoving that site's
      // enemies one step onward. Per the Wave of Eviction FAQ the flood and push CONTINUE EVEN ACROSS A
      // VOID — a siteless square is simply passed over — so the wave only stops at the edge of the realm.
      // A carried enemy still moves by a one-step forced push, which can't enter the void, so enemies at
      // the last site before a void gap pile up there while sites beyond the gap are still flooded.
      let x = c.x as number
      let y = c.y as number
      const flooded: string[] = []
      for (;;) {
        if (!inBounds(x, y)) break // the wave reaches the edge of the realm and stops
        const site = siteAt(ctx.state, x, y)
        if (site) {
          if (!site.flooded && applyFlood(ctx.state, site, ctx.controller)) {
            flooded.push(site.id)
          }
          // carry this flooded site's enemies one step onward (a forced push; can't cross into the void)
          for (const u of unitsAt(ctx.state, x, y, 'surface')) {
            if (u.controller === ctx.controller) continue // sweep every ENEMY here — avatars included
            const nx = u.x + dx
            const ny = u.y + dy
            if (inBounds(nx, ny) && siteAt(ctx.state, nx, ny)) {
              ctx.teleport(u.id, nx, ny, 'surface', { push: true })
              pushLog(ctx.state, ctx.controller, `${u.name} is swept along by the wave!`)
            }
          }
        }
        // a void square is passed over — the wave carries on across it (FAQ) toward the realm edge
        x += dx
        y += dy
      }
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.unfloodAtEnd = [...(ctx.state.flow.unfloodAtEnd ?? []), ...flooded]
    },
  },
})
