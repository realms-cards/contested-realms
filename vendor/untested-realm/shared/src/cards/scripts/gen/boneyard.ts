import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { pushLog, effectSummonUnit } from '../../../engine/effects'
import type { PlayerId } from '../../../engine/types'

// 'Genesis â†’ Each player may summon a minion from their cemetery here.'
registerScript('Boneyard', {
  genesis: (ctx) => {
    // controller first, then the opponent (each optional)
    askPlayerPick(ctx, ctx.controller, true)
  },
  conts: {
    pick0: (ctx, contCtx, choice) => {
      boneyardSummon(ctx, contCtx.player, choice)
      if (contCtx.next) askPlayerPick(ctx, (1 - contCtx.player) as PlayerId, false)
    },
  },
})

function askPlayerPick(ctx: EffectAPI, player: PlayerId, next: boolean) {
  const p = ctx.state.players[player]
  const options = [...new Set(p.cemetery.map((id) => ctx.state.cards[id].name).filter((n) => getCard(n).type === 'Minion'))]
  if (!options.length) {
    if (next) askPlayerPick(ctx, (1 - player) as PlayerId, false)
    return
  }
  ctx.ask(
    { kind: 'chooseOption', title: 'Boneyard: summon a dead minion here? ', data: { options: [...options, '(none)'] }, player },
    'pick0',
    { player, next },
  )
}

function boneyardSummon(ctx: EffectAPI, player: PlayerId, choice: any) {
  if (!choice || choice === '(none)') return
  const site = ctx.state.sites[ctx.sourceId]
  if (!site) return
  const p = ctx.state.players[player]
  const idx = p.cemetery.findIndex((id) => ctx.state.cards[id].name === choice)
  if (idx < 0) return
  const [cardId] = p.cemetery.splice(idx, 1)
  const unitId = `u${ctx.state.nextId++}`
  // reanimated into the realm â†’ Genesis fires (FAQ 1242)
  effectSummonUnit(ctx.state, {
    id: unitId, cardId, name: String(choice), owner: ctx.state.cards[cardId].owner, controller: player,
    isAvatar: false, x: site.x, y: site.y, region: 'surface', tapped: false, damage: 0,
    enteredTurn: ctx.state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
  })
  pushLog(ctx.state, player, `${choice} claws out of the Boneyard.`)
}
