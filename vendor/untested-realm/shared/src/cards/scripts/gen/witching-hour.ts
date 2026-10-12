import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { effSubtypes, effKeywords } from '../../../engine/statics'
import { isEvilU } from '../multi-card-utils/is-evil-u'

// 'Your Evil, Spellcaster, and Spirit allies gain Airborne and +1 power this turn.'
registerScript('Witching Hour', {
  onCast: (ctx) => {
    for (const u of Object.values(ctx.state.units)) {
      if (u.controller !== ctx.controller || u.isAvatar) continue
      const st = effSubtypes(ctx.state, u)
      const kw = effKeywords(ctx.state, u)
      if (isEvilU(ctx.state, u) || kw.spellcaster || st.includes('Spirit')) {
        ctx.grantKeyword(u.id, 'airborne', 'endOfTurn')
        ctx.addPower(u.id, 1, 'endOfTurn')
      }
    }
    pushLog(ctx.state, ctx.controller, 'The witching hour tolls — dark things take wing.')
  },
})
