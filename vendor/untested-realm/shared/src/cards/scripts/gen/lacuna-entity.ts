import { registerScript } from '../registry'
import { getCard } from '../../db'
import { adjacentSquaresW, siteAt } from '../../../engine/grid'
import { checkWard } from '../../../engine/effects'
import { effAttack, effDefence } from '../../../engine/statics'
import type { GameState, UnitState } from '../../../engine/types'

const avgPow = (state: GameState, u: UnitState) => Math.floor((effAttack(state, u) + effDefence(state, u)) / 2)

// "weaker than THIS minion" Genesis filters run before the minion is on the board
// (validateTarget's caster is the summoner, not the entering minion), so measure
// against the minion's printed power.
const printedAvg = (name: string) => { const d = getCard(name); return Math.floor(((d.attack ?? 0) + (d.defence ?? 0)) / 2) }

// 'Genesis → Drag target weaker minion from an adjacent site to here, ignoring regions.'
// It targets, but "ignoring regions" reaches every region, so the spec isn't `targeted` (that would hold it
// to the Entity's region): Stealth and Ward are applied here instead. The filter's `caster` stands where
// the Entity lands, so "from an adjacent site" is measured from there.
registerScript('Lacuna Entity', {
  genesisTargets: [{
    what: 'minion', count: 1, upTo: true, targeted: false, label: 'target weaker minion at an adjacent site',
    filter: (state, u, caster) =>
      !(u.stealth && u.controller !== caster.controller) && // Stealth: can't be targeted by an enemy
      !!siteAt(state, u.x, u.y) &&
      adjacentSquaresW(state, caster.x, caster.y).some((s) => s.x === u.x && s.y === u.y) &&
      avgPow(state, u) < printedAvg('Lacuna Entity'),
  }],
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    const t = ctx.targets[0]
    if (!self || !t || !('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    if (!adjacentSquaresW(ctx.state, self.x, self.y).some((s) => s.x === u.x && s.y === u.y)) return
    // an enemy's Ward breaks instead, and the minion stays put (Codex, Ward)
    if (checkWard(ctx.state, u, ctx.controller, u.controller, 'target')) return ctx.log(`${u.name}'s ward breaks — the Entity cannot touch it.`)
    // "ignoring regions" is about ELIGIBILITY — the drag reaches a victim in ANY region of the adjacent
    // site (surface, underground, underwater, void). But it pulls the victim to HERE = the Entity's
    // location INCLUDING its region: a submerged Entity drags the minion UNDERWATER (a non-Submerge
    // victim then drowns) and a void-dwelling Entity (Voidwalk) drags it INTO THE VOID (a non-Voidwalk
    // victim is lost to the abyss). That removal is the card's whole point. `intoVoid` lets the push
    // reach the Entity's siteless void square; full push semantics otherwise (Cage-lock, push-bans,
    // move-protection). checkStateBased settles the drown/banish once the victim lands.
    ctx.teleport(u.id, self.x, self.y, self.region, { push: true, intoVoid: true })
  },
})
