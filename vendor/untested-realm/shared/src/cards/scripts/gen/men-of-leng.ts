import { registerScript } from '../registry'

// 'Whenever Men of Leng strike an Avatar, that Avatar discards a random card.'
registerScript('Men of Leng', {
  onAllyStrikesAvatar: (ctx, striker, avatar) => {
    if (striker.id !== ctx.sourceId) return
    ctx.discardRandom(avatar.controller)
  },
})
