import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { CROSS_3X3, Cell, applyGrid, mergeCells, resolveCells } from '../multi-card-utils/apply-grid'

const METEOR_MEDIUM: Cell[] = [
  { dx: 0, dy: 0, dmg: 4 },
  { dx: 1, dy: 0, dmg: 2 }, { dx: -1, dy: 0, dmg: 2 }, { dx: 0, dy: 1, dmg: 2 }, { dx: 0, dy: -1, dmg: 2 },
]

const METEOR_SMALL: Cell[] = [{ dx: 0, dy: 0, dmg: 3 }]

/** true if no two of the three chosen sites share a border (diagonals are fine per FAQ) */
function meteorSitesLegal(sites: ({ x: number; y: number } | null | undefined)[]): boolean {
  if (sites.some((s) => !s)) return false
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      const a = sites[i]!, b = sites[j]!
      if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1) return false
    }
  }
  return true
}

// 'Target three sites that share no borders. [3x3 big / cross of 2s+4 / single 3]'
registerScript('Meteor Shower', {
  areaDamage: (state, _casterId, params) => {
    if (!params.sites || params.sites.length < 3) return null
    const sites = params.sites.map((id) => state.sites[id])
    if (!meteorSitesLegal(sites)) return null
    // three impacts on distinct, non-bordering sites → the areas never overlap, so a
    // plain concatenation is safe (dedupe defensively anyway, keeping the larger blast).
    return mergeCells([
      ...resolveCells(state, sites[0]!, CROSS_3X3, 'n', { atopSitesOnly: true }),
      ...resolveCells(state, sites[1]!, METEOR_MEDIUM, 'n', { atopSitesOnly: true }),
      ...resolveCells(state, sites[2]!, METEOR_SMALL, 'n', { atopSitesOnly: true }),
    ])
  },
  targets: [
    { what: 'site', count: 1, targeted: true, label: 'first impact (big meteor)' },
    { what: 'site', count: 1, targeted: true, label: 'second impact (medium)' },
    { what: 'site', count: 1, targeted: true, label: 'third impact (small)' },
  ],
  // engine-authoritative legal set per pick: any site that shares NO border with an already-chosen
  // one (diagonals are fine per FAQ). The client progressively narrows the clickable sites as you pick
  // the first, then second meteor, and castSpell rejects a bordering pick — so the three impacts can
  // never touch (previously the client let you pick adjacent sites and the whole spell fizzled).
  targetOptions: (state, _caster, picked) => {
    const chosen = picked
      .filter((p) => 'site' in p)
      .map((p) => state.sites[(p as { site: string }).site])
      .filter(Boolean)
    const out: { site: string }[] = []
    for (const s of Object.values(state.sites)) {
      // Manhattan distance ≤ 1 to any chosen site = shares a border (or is that site) → illegal
      if (chosen.some((c) => Math.abs(c.x - s.x) + Math.abs(c.y - s.y) <= 1)) continue
      out.push({ site: s.id })
    }
    return out
  },
  onCast: (ctx) => {
    const sites = ctx.targets.map((t) => ('site' in t ? ctx.state.sites[t.site] : null))
    if (sites.some((s) => !s)) return
    if (!meteorSitesLegal(sites)) return ctx.log('The sites must share no borders.')
    applyGrid(ctx, sites[0]!, CROSS_3X3, 'n', { region: 'surface', atopSitesOnly: true })
    applyGrid(ctx, sites[1]!, METEOR_MEDIUM, 'n', { region: 'surface', atopSitesOnly: true })
    applyGrid(ctx, sites[2]!, METEOR_SMALL, 'n', { region: 'surface', atopSitesOnly: true })
    pushLog(ctx.state, ctx.controller, '☄☄☄ The sky falls!')
  },
})
