import { registerScript, getScript, type TargetRef } from '../registry'
import { pushLog, makeCtx, pushPrompt, registerCont } from '../../../engine/effects'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'
import { abilitiesOff } from '../../../engine/statics'
import { legalTargetsFor, targetRefId } from '../../../engine/casting'
import type { GameState, PlayerId, Region } from '../../../engine/types'

// 'May be summoned as a basic copy of a nearby minion.'
registerScript('Selfsame Simulacrum', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const models = nearbySquaresW(ctx.state, self.x, self.y)
      // nearby minion is region-locked to the source
      .flatMap((s) => unitsAt(ctx.state, s.x, s.y, self.region))
      .filter((u) => !u.isAvatar && u.id !== self.id)
      .map((u) => u.id)
    if (!models.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'The Simulacrum mirrors which nearby minion? (skip to stay itself)', data: { candidates: models, count: 1, upTo: true, kind: 'unit' } }, 'mirror')
  },
  conts: {
    mirror: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const self = ctx.state.units[ctx.sourceId]
      const model = typeof id === 'string' ? ctx.state.units[id] : null
      if (!self || !model) return
      self.name = model.name
      pushLog(ctx.state, ctx.controller, `The Simulacrum reshapes itself into ${model.name}.`)
      // "May be SUMMONED AS a basic copy" + FAQ: "Does it copy Genesis abilities? A: Yes" — the copy
      // applies as it is summoned, so the copied card's Genesis fires now, with its own targets picked
      // like a cast's (anchored on the Simulacrum).
      if (!abilitiesOff(ctx.state, self)) copiedGenesis(ctx.state, self.id, ctx.controller, [])
    },
  },
})

// Pick the copied Genesis's targets one spec at a time (the same legal set a cast offers), then fire it.
// Continuations are engine-level: the Simulacrum now carries the model's name, so its own script's conts
// would no longer be reached.
function copiedGenesis(state: GameState, selfId: string, player: PlayerId, picked: TargetRef[]): void {
  const self = state.units[selfId]
  const script = self ? getScript(self.name) : null
  if (!self || !script?.genesis) return
  const specs = script.genesisTargets ?? []
  let idx = 0, acc = 0
  for (; idx < specs.length; idx++) { if (picked.length < acc + specs[idx].count) break; acc += specs[idx].count }
  const fire = () => script.genesis!(makeCtx(state, selfId, player, picked, { x: self.x, y: self.y, region: self.region }))
  if (idx >= specs.length) return fire()
  const spec = specs[idx]
  const legal = legalTargetsFor(state, { script, specs, caster: self, player, source: self.name }, picked, { specIndex: idx, squareRegions: [self.region] })
    .filter((r) => !('unit' in r && r.unit === selfId) || specs[idx].what === 'square')
  if (!legal.length) return fire() // nothing legal: the Genesis does as much as it can
  const title = `${self.name} (Simulacrum) — ${spec.label ?? 'choose a target'}`
  if (spec.what === 'square') {
    pushPrompt(state, { player, kind: 'chooseSquare', title, data: { squares: legal.flatMap((r) => ('square' in r ? [{ x: r.square.x, y: r.square.y }] : [])) }, cont: 'simulacrum:square', ctx: { selfId, player, picked, region: self.region } })
    return
  }
  pushPrompt(state, { player, kind: 'chooseTargets', title, data: { candidates: legal.map(targetRefId), count: 1, upTo: !!spec.upTo, kind: spec.what === 'site' ? 'site' : 'unit' }, cont: 'simulacrum:target', ctx: { selfId, player, picked, legal } })
}

registerCont('simulacrum:target', (state, c: { selfId: string; player: PlayerId; picked: TargetRef[]; legal: TargetRef[] }, choice) => {
  const id = Array.isArray(choice) ? choice[0] : choice
  const ref = c.legal.find((r) => targetRefId(r) === id)
  const self = state.units[c.selfId]
  // skipped an optional pick: fire with what was chosen
  if (!ref) { if (self) getScript(self.name)?.genesis?.(makeCtx(state, c.selfId, c.player, c.picked, { x: self.x, y: self.y, region: self.region })); return }
  copiedGenesis(state, c.selfId, c.player, [...c.picked, ref])
})
registerCont('simulacrum:square', (state, c: { selfId: string; player: PlayerId; picked: TargetRef[]; region: Region }, choice) => {
  const sq = choice as { x: number; y: number } | null
  const self = state.units[c.selfId]
  if (!sq || typeof sq.x !== 'number') { if (self) getScript(self.name)?.genesis?.(makeCtx(state, c.selfId, c.player, c.picked, { x: self.x, y: self.y, region: self.region })); return }
  copiedGenesis(state, c.selfId, c.player, [...c.picked, { square: { x: sq.x, y: sq.y, region: c.region } }])
})
