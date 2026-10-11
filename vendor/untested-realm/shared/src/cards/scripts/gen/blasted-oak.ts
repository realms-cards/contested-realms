import { registerScript } from '../registry'

// -------------------------------------------------------------- Blasted Oak ----
// 'If a spell or non-basic ability can target—in order of precedence—Blasted
//  Oak, its site or location, or anything else at its site or location, it must.'
// (enforced by targetCompulsion() inside validateTarget)
registerScript('Blasted Oak', { compelsTargets: true })
