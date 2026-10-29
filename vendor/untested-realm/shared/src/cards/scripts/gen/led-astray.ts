import { registerScript } from '../registry'
import { adjacentSquaresW, unitsAt } from '../../../engine/grid'
import { isLegalStep, takeOwnStep } from '../../../engine/movement'
import { checkStateBased } from '../../../engine/effects'
import type { GameState, PlayerId, Region, UnitState } from '../../../engine/types'

// "Choose any number of enemies at target location. They take a step together to another location
// they're adjacent to."
// Codex (Forced Movement): "[[Led Astray]] is not forced movement, because the unit is taking their own
// step (and an Immobile unit wouldn't move at all)." So each chosen enemy steps itself (isLegalStep),
// and an "adjacent location" keeps to the same region (Codex, Adjacent).
type From = { x: number; y: number; region: Region }

const enemiesAt = (state: GameState, from: From, me: PlayerId): UnitState[] =>
  unitsAt(state, from.x, from.y, from.region).filter((u) => u.controller !== me && u.x === from.x && u.y === from.y)

/** the adjacent locations at least one of these units could step to */
function destinations(state: GameState, from: From, units: UnitState[]): { x: number; y: number }[] {
  return adjacentSquaresW(state, from.x, from.y)
    .filter((s) => !(s.x === from.x && s.y === from.y))
    .filter((s) => units.some((u) => isLegalStep(state, u, from, { x: s.x, y: s.y, region: from.region })))
}

registerScript('Led Astray', {
  targets: [{ what: 'square', count: 1, targeted: true, label: 'target location' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('square' in t)) return
    const from: From = { x: t.square.x, y: t.square.y, region: t.square.region ?? ctx.caster?.region ?? 'surface' }
    const enemies = enemiesAt(ctx.state, from, ctx.controller)
    if (!enemies.length) return ctx.log('No enemies there.')
    ctx.ask(
      { kind: 'chooseTargets', title: 'Led Astray — which enemies take the step?', data: { candidates: enemies.map((u) => u.id), count: enemies.length, upTo: true, kind: 'unit' } },
      'astrayWho',
      { from },
    )
  },
  conts: {
    astrayWho: (ctx, c: any, choice: any) => {
      const from = c.from as From
      const picked: string[] = Array.isArray(choice) ? choice : choice ? [choice] : []
      const units = enemiesAt(ctx.state, from, ctx.controller).filter((u) => picked.includes(u.id))
      if (!units.length) return ctx.log('No one is led astray.')
      const squares = destinations(ctx.state, from, units)
      if (!squares.length) return ctx.log(units.length > 1 ? 'They have nowhere to step.' : `${units[0].name} has nowhere to step.`)
      const ids = units.map((u) => u.id)
      if (squares.length === 1) { stepTogether(ctx.state, from, ids, squares[0], ctx.controller); return }
      ctx.ask({ kind: 'chooseSquare', title: 'Led Astray — step them to which adjacent location?', data: { squares } }, 'astray', { from, ids })
    },
    astray: (ctx, c: any, choice: any) => {
      if (!choice || typeof choice.x !== 'number') return
      stepTogether(ctx.state, c.from as From, c.ids as string[], { x: choice.x, y: choice.y }, ctx.controller)
    },
  },
})

/** "They take a step together": each chosen enemy still there steps to the same location — one that
 *  can't (Immobile, a wall, an entry ban) stays put. */
function stepTogether(state: GameState, from: From, ids: string[], to: { x: number; y: number }, me: PlayerId): void {
  if (!adjacentSquaresW(state, from.x, from.y).some((s) => s.x === to.x && s.y === to.y)) return
  for (const u of enemiesAt(state, from, me).filter((e) => ids.includes(e.id))) {
    const step = { x: to.x, y: to.y, region: from.region }
    if (isLegalStep(state, u, from, step)) takeOwnStep(state, u, step)
  }
  checkStateBased(state)
}
