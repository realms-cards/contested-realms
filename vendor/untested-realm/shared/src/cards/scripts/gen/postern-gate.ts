import { registerScript } from '../registry'

// 'Enters the realm under an opponent's control.' — applied as it enters (enterSite), not as a Genesis,
// so a silencer next to it (Smokestacks of Gnaak) can't keep it on your side
registerScript('Postern Gate', { entersUnderOpponent: true })
