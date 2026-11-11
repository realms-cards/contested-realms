import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// ------------------------------------------------------------ Yog-Sothoth ----
// 'Occupies all locations safely. / Is banished without five voids. /
//  Ignores the abilities of sites.'
// Its every-location footprint is a characteristic (FAQ: it stays even when silenced or disabled), so
// checkStateBased applies it from the NAME (occupiesAllLocations) — a Shapeshift / Monstermorphosis into
// Yog-Sothoth covers the realm at once — and checks the five voids whenever the board settles.
registerScript('Yog-Sothoth', {
  ignoresSites: true,
  occupiesAllLocations: { minVoids: 5 },
  // 'safely': no terrain can harm what exists everywhere and nowhere. It already
  // occupies EVERY location, so it never moves (nowhere to go) — but it can strike
  // anything anywhere (occupiedSquares covers the whole realm).
  selfKeywords: () => ['voidwalk', 'submerge', 'burrowing', 'immobile'],
  genesis: (ctx) => {
    if (ctx.state.units[ctx.sourceId]) pushLog(ctx.state, ctx.controller, '👁 Yog-Sothoth IS the gate. It occupies all locations.')
  },
})
