// Deterministic timing policy; the bot owns and cancels the actual timers.
// The human client reports the board not visible while its tab is hidden (and a beat after
// returning) and while a CPU play reveal is up, so resuming only needs a short beat.
const RESUME_MS = 1000;
class ActionPacing {
  constructor() { this.matchId = null; this.turnKey = null; this.nextAt = 0; this.visible = false; }
  ready(matchId, now) {
    if (this.matchId === matchId) {
      if (!this.visible) this.nextAt = Math.max(this.nextAt,now+RESUME_MS);
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
  acted(now) { this.nextAt = now+2000; }
  // A spell, ability or fight that just resolved gets its own beat, so its result can be read before the next action.
  settled(now) { this.nextAt = Math.max(this.nextAt,now+1800); }
  pause() { this.visible = false; }
}
module.exports = { ActionPacing, RESUME_MS };
