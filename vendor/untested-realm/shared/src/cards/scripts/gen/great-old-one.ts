import { registerScript } from '../registry'
import { pushLog, checkStateBased, applyFlood } from '../../../engine/effects'

// 'Submerge / Genesis → Permanently flood the entire realm, including voids.'
registerScript('Great Old One', {
  genesis: (ctx) => {
    // the ENTIRE realm drowns — every site, rubble included (flooded rubble is water). applyFlood still
    // respects Bedrock's "can't be modified"; a siteless void square simply has no site to flood.
    for (const s of Object.values(ctx.state.sites)) applyFlood(ctx.state, s, ctx.controller)
    pushLog(ctx.state, null, 'The Great Old One rises — the realm drowns beneath the deluge!')
    checkStateBased(ctx.state)
  },
})
