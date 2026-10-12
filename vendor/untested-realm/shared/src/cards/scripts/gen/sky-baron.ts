import { registerScript } from '../registry'

// ---------- keyword removal ----------

// 'Airborne / All other minions lose Airborne.'
registerScript('Sky Baron', {
  removesKeywords: (state, selfId, unit) =>
    unit.id !== selfId && !unit.isAvatar ? ['airborne'] : [],
})
