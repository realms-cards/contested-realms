import { type CardScript } from '../registry'
import { getCard } from '../../db'
import { avatarOf } from '../../../engine/grid'
import { castFromCollection, affordable } from '../../../engine/casting'
import type { Thresholds } from '../../../engine/types'

/** '(threshold) — Genesis → You may cast X from your collection to this site.' */
export function collectionSiteScript(siteName: string, minionName: string, element: keyof Thresholds, need: number): CardScript {
  return {
    genesis: (ctx) => {
      let have = 0
      for (const s of Object.values(ctx.state.sites)) {
        if (s.controller === ctx.controller && !s.isRubble) have += getCard(s.name).thresholds[element]
      }
      if (have < need) return
      // "you may CAST X from your collection to this site" — only offer it if you
      // own a copy and can pay for it (the cast pays its cost; see castFromCollection)
      if ((ctx.state.players[ctx.controller].collection[minionName] ?? 0) <= 0) return
      if (!affordable(ctx.state, ctx.controller, minionName, avatarOf(ctx.state, ctx.controller))) return
      ctx.ask({ kind: 'yesNo', title: `${siteName}: cast a ${minionName} from your collection here?` }, 'spawn')
    },
    conts: {
      spawn: (ctx, _c, yes) => {
        const self = ctx.state.sites[ctx.sourceId]
        if (!yes || !self) return
        // a REAL paid cast to this site, not a free summon (card text says "cast")
        castFromCollection(ctx.state, ctx.controller, minionName, { x: self.x, y: self.y, region: 'surface' })
      },
    },
  }
}
