import { registerScript } from '../registry'
import { pushLog, newId } from '../../../engine/effects'
import type { GameState, UnitState } from '../../../engine/types'
import { adjacentSquaresW } from '../../../engine/grid'
import { siteSilenced } from '../../../engine/statics'

// squares adjacent to a live (controlled, un-rubbled, un-silenced) Infusion Factory
function factorySquares(state: GameState, siteId: string): { x: number; y: number }[] {
  const site = state.sites[siteId]
  if (!site || site.controller === null || site.isRubble || siteSilenced(state, site)) return []
  return adjacentSquaresW(state, site.x, site.y).filter((s) => s.x !== site.x || s.y !== site.y)
}

function nearAnyFactory(state: GameState, x: number, y: number): boolean {
  return Object.values(state.sites).some(
    (s) => s.name === 'Infusion Factory' && factorySquares(state, s.id).some((q) => q.x === x && q.y === y),
  )
}

function infusionSync(state: GameState): void {
  // wind up: ground artifacts adjacent to a live factory become units
  for (const art of Object.values(state.artifacts)) {
    if (art.carriedBy || art.region !== 'surface') continue
    if (!nearAnyFactory(state, art.x, art.y)) continue
    const controller = art.conjuredBy
    const unitId = newId(state, 'u')
    const u: UnitState = {
      id: unitId, cardId: art.cardId, name: art.name, owner: state.cards[art.cardId]?.owner ?? controller,
      controller, isAvatar: false, x: art.x, y: art.y, region: 'surface', tapped: art.tapped,
      damage: 0, enteredTurn: state.turn,
      modifiers: [{ kind: 'power', amount: 2, duration: 'permanent', turn: state.turn, sourcePlayer: controller }],
      carrying: [], carryingUnits: [], usedThisTurn: {}, counters: { animatedArtifact: 1, infused: 1 },
    }
    delete state.artifacts[art.id]
    state.units[unitId] = u
    pushLog(state, controller, `⚙️ ${u.name} whirs to life beside the Infusion Factory.`)
  }
  // wind down: infused units that wandered out of reach fall inert
  for (const u of Object.values(state.units)) {
    if (!u.counters?.infused) continue
    if (u.region === 'surface' && nearAnyFactory(state, u.x, u.y)) continue
    const artId = newId(state, 'a')
    state.artifacts[artId] = {
      id: artId, cardId: u.cardId, name: u.name, conjuredBy: u.controller,
      x: u.x, y: u.y, region: u.region === 'void' ? 'surface' : u.region, carriedBy: null, tapped: u.tapped,
    }
    delete state.units[u.id]
    pushLog(state, u.controller, `${u.name} sputters and falls inert, out of the Factory's reach.`)
  }
}

registerScript('Infusion Factory', {
  subtypeOverride: (_state, _selfId, unit, st) =>
    unit.counters?.infused && !st.includes('Automaton') ? [...st, 'Automaton'] : st,
  genesis: (ctx) => infusionSync(ctx.state),
  startOfEachTurn: (ctx) => infusionSync(ctx.state),
  endOfEveryTurn: (ctx) => infusionSync(ctx.state),
  onUnitEntersSquare: (ctx) => infusionSync(ctx.state),
  onUnitEnters: (ctx) => infusionSync(ctx.state),
  onSelfDestroyed: (ctx) => infusionSync(ctx.state),
})
