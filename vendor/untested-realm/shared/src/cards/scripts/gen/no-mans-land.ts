import { registerScript } from '../registry'

// "Players can't summon minions to this site or to the one directly in front of it."
registerScript("No Man's Land", {
  blockSummon: (state, site, at) => {
    if (at.x === site.x && at.y === site.y) return true
    // "in front" = toward the opponent from the controller's perspective
    const s = Object.values(state.sites).find((x) => x.x === site.x && x.y === site.y)
    const dir = s?.controller === 0 ? 1 : -1
    return at.x === site.x && at.y === site.y + dir
  },
})
