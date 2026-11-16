import { registerScript } from '../registry'

// 'Ranged / May shoot across the top and bottom edges of the realm.'
// Ranged comes from the keyword line. Shooting north or south, the shot may fly off the top/bottom edge
// and come in at the other end of the same column (its region, its range) — shootProjectile asks the
// shooter whether to, but only when crossing would hit something (the shot can hit allies too, so it's a
// real choice). Not while the realm is flat (Flat Realm Society); a Magellan Globe already joins the edges.
registerScript('Sissi Marksmen', {
  rangedWrapsTopBottom: true,
})
