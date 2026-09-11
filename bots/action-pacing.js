// Deterministic timing policy; the bot owns and cancels the actual timers.
class ActionPacing {
  constructor() { this.matchId = null; this.turnKey = null; this.nextAt = 0; this.visible = false; }
  ready(matchId, now) {
    if (this.matchId === matchId) {
      if (!this.visible) this.nextAt = Math.max(this.nextAt,now+2000);
      this.visible = true;
      return;
    }
    this.visible = true;
    this.matchId = matchId;
    this.turnKey = null;
    this.nextAt = now + 5000;
  }
  delay(matchId, turnKey, now) {
    if (this.matchId !== matchId || !this.visible) return Infinity;
    if (this.turnKey !== turnKey) {
      this.turnKey = turnKey;
      this.nextAt = Math.max(this.nextAt,now+2000);
    }
    return Math.max(0,this.nextAt-now);
  }
  acted(now) { this.nextAt = now+1600; }
  pause() { this.visible = false; }
}
module.exports = { ActionPacing };
