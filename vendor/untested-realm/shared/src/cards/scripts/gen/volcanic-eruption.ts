import { registerScript } from '../registry'
import { fireVolleyProjectiles } from '../../../engine/combat'
import { registerCont, resumeWhenSettled } from '../../../engine/effects'
import type { GameState, PlayerId } from '../../../engine/types'
import { trapScript } from '../multi-card-utils/trap'

// 'Trap (2) → Shoot three 1-damage projectiles in different cardinal directions.'
// You choose the one direction left out; the three shots fly from the site, one at a time. A shot that
// must ask which of several units it hits pauses the eruption until that is answered.
const DIRS = ['n', 's', 'e', 'w'] as const
const NAMES: Record<string, string> = { n: 'north', s: 'south', e: 'east', w: 'west' }

interface Eruption { player: PlayerId; x: number; y: number; dirs: string[] }

function erupt(state: GameState, e: Eruption): void {
  for (let i = 0; i < e.dirs.length; i++) {
    const asked = state.prompts.length
    fireVolleyProjectiles(state, { player: e.player, ox: e.x, oy: e.y, region: 'surface', dir: e.dirs[i], volleys: 1, damage: 1, srcName: 'Volcanic Eruption' })
    if (state.prompts.length > asked && i + 1 < e.dirs.length) {
      resumeWhenSettled(state, 'volcanic-eruption:next', { ...e, dirs: e.dirs.slice(i + 1) })
      return
    }
  }
}

registerCont('volcanic-eruption:next', (state, e: Eruption) => erupt(state, e))

registerScript('Volcanic Eruption', trapScript({
  label: 'three 1-damage projectiles in different directions',
  mana: 2,
  effect: (ctx) => {
    ctx.ask({ kind: 'chooseOption', title: 'Volcanic Eruption: which direction is spared?', data: { options: DIRS.map((d) => `spare the ${NAMES[d]}`) } }, 'spare')
  },
  conts: {
    spare: (ctx, _c, choice) => {
      const site = ctx.state.sites[ctx.sourceId]
      const spared = DIRS.find((d) => choice === `spare the ${NAMES[d]}`)
      if (!site || !spared) return
      erupt(ctx.state, { player: ctx.controller, x: site.x, y: site.y, dirs: DIRS.filter((d) => d !== spared) })
    },
  },
}))
