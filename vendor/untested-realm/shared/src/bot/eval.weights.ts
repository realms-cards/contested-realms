// ─────────────────────────────────────────────────────────────────────────────
// TURN-STATE EVALUATION WEIGHTS  (the chess-bot's "piece values")
//
// This is the tuning knob. Every number here is a coefficient on one feature of
// `evaluate(state, me)` (see eval.ts). Positive = good for `me`, negative = bad.
// Edit these freely and re-run the mirror sweep to measure the effect.
//
// ── SCALE ANCHOR ────────────────────────────────────────────────────────────
// Everything is quoted in HP. One point of avatar life at NORMAL (high) life is
// worth `avatarLifePerHp` (= 10). So a feature "worth 3.5 HP" gets a weight of 35.
// The user's resource exchange rate:  1 mana income ≈ 1 unknown foe card ≈ 1 extra
// draw ≈ 3.5 HP.  Life is NONLINEAR (convex): below `lowLifeThreshold` each further
// HP lost hurts progressively more (a quadratic penalty), so HP outweighs a card
// when you're near death — which is why you "pay 3 life rather than let them draw,
// unless very low". `win` dwarfs every heuristic so a real win never loses to fluff.
// ─────────────────────────────────────────────────────────────────────────────

export interface EvalWeights {
  // ── Terminal ──────────────────────────────────────────────────────────────
  /** flat score for a decided position (foe avatar dead / foe decked out). */
  win: number

  // ── Life / win-proximity (dominant, NONLINEAR) ────────────────────────────
  /** value of ONE point of avatar life in the linear (high-life) regime. The HP anchor:
   *  a feature worth N HP is weighted N × this. */
  avatarLifePerHp: number
  /** below this life total, each further HP lost is penalised quadratically (life matters more when
   *  low — for BOTH avatars). */
  lowLifeThreshold: number
  /** coefficient on the convex low-life penalty: −lowLifeQuadratic × max(0, threshold − life)². */
  lowLifeQuadratic: number
  /** per point the FOE avatar is BELOW its starting life — DEALING DAMAGE is the bot's driving force,
   *  so this is weighted heavily (on top of the life differential). It's what makes the bot go for the
   *  face and auto-raze sites (razing = life loss) instead of turtling. */
  foeLifePressure: number

  /** flat "near-win" bonus when the FOE avatar is at death's door and finishable (survived the immune
   *  turn) — life is floored at 0, so without this the bot sees no reason to go for the kill. */
  foeDeathsDoor: number
  /** per step of distance from my NEAREST unit to a death's-door foe avatar (negative → close in for the
   *  kill). Weighted strongly — once the foe is at death's door, chasing it down is the whole game. */
  chaseDeathsDoor: number
  /** per step from my NEAREST unit to the FOE avatar when I pilot the Interrogator (negative → march
   *  into strike range). This is the APPROACH gradient the reachingPower terms lack (they only reward
   *  being already in range — a cliff); without it the bot never starts the march across the board. */
  interrogatorChase: number
  /** mirror of foeDeathsDoor for MY avatar (penalty) — when I'm on death's door, value survival. */
  myDeathsDoor: number
  /** per step my death's-door avatar is from the nearest ENEMY unit (positive → flee the finisher). */
  fleeDeathsDoor: number
  /** per point of enemy attack-power that can reach MY avatar next turn (penalty). */
  myAvatarExposed: number
  /** per point of MY attack-power that can reach the FOE avatar next turn (bonus — pressure). */
  foeAvatarThreatened: number
  /** EXTRA per-point foe-avatar pressure when I pilot the Interrogator (striking the enemy avatar
   *  taxes them 3 life or draws me a spell — so avatar aggression is doubly good). */
  interrogatorAggression: number

  // ── Avatar safety: undefended = no co-located friendly defender ────────────
  /** flat penalty for an undefended avatar EVEN with no attacker in sight (small, always on). */
  avatarUndefended: number
  /** extra undefended penalty when the FOE is an Interrogator (an unblocked strike taxes you). */
  avatarUndefendedVsInterrogator: number
  /** extra undefended penalty when MY avatar is at death's door (a single strike ends it). */
  avatarUndefendedDeathsDoor: number
  /** penalty while DEVELOPING (< 6 sites) if my avatar is UNTAPPED — it should tap each turn to play a
   *  site, not sit idle. Drives site development and keeps the avatar doing its job. */
  avatarIdle: number
  /** penalty for a WEAK (power ≤ 1) avatar sitting OFF its own sites while developing (< 6 sites) — a
   *  support avatar like the Interrogator shouldn't wander; aggression is the minions' job, not its. */
  avatarWander: number
  /** penalty for spending the avatar's Tap on a NON-site special ability (Sorcerer's "Draw a spell", …)
   *  instead of developing. HEAVY under 5 sites, moderate at 5, slight at 6, NOTHING above 6 (fully
   *  developed). Below 4 sites the bot never even considers it (a hard ban in moves.ts). */
  avatarTapWaste: number

  // ── Material (per non-avatar unit, mine − foe) ─────────────────────────────
  /** per point of (effective attack + FULL defence). Non-lethal damage is ignored — it heals each turn,
   *  so a damaged-but-surviving minion is worth its full stats (see unitValue). */
  unitStat: number
  /** per point of printed mana cost — a proxy for total worth so a low-stat, high-ability support
   *  minion isn't undervalued. */
  unitCost: number
  /** flat bonus for a minion that actually has an ability/trigger (support). */
  supportAbility: number
  /** penalty for a tapped unit (can't act this turn). */
  tappedPenalty: number
  /** small penalty for a summoning-sick unit (can't attack yet). */
  summonSickPenalty: number
  /** penalty for a disabled or silenced unit (abilities off). */
  disabledPenalty: number
  /** multiplier on the value of an ENEMY minion (mine × 1, foe × this). >1 makes killing enemy minions
   *  worth more AND their presence more threatening → more defensive, removal-minded play. */
  foeUnitFactor: number

  // ── Keyword bonuses (flat, per unit that has the keyword) ──────────────────
  kwAirborne: number
  kwRanged: number
  kwLethal: number
  kwStealth: number
  kwWard: number
  kwSpellcaster: number
  /** immobile is a drawback → negative. */
  kwImmobile: number

  // ── Auras / sites / board ──────────────────────────────────────────────────
  /** per point of printed mana cost of an aura I control in play (mine − foe) — auras are permanents. */
  auraCost: number
  /** per cost of a MONUMENT artifact (stationary permanent), scored to its controller. */
  artifactMonument: number
  /** per cost of a CARRIABLE artifact that is actually CARRIED — positive if MY unit carries it (even a
   *  foe's), negative if an ENEMY unit carries it (even mine). Uncarried carriables score 0 (inert). */
  artifactCarried: number
  /** per point of net mana income from sites (my income − foe income). ≈ 3.5 HP per point. */
  siteMana: number
  /** per element of affinity that meets your DECK's threshold demand. */
  thresholdFit: number
  /** per net controlled site (mine − foe), on top of its mana. */
  siteControl: number
  /** per point of PREDICTED loss on my undefended, enemy-reachable sites (razing damage + denied mana). */
  exposedSite: number
  /** per point of predicted damage I can deal to the enemy's undefended, reachable sites. */
  foeExposedSite: number
  /** SEVERE penalty per enemy-controlled site inside MY home (columns b–d, my two back rows). */
  homeIntruded: number
  /** penalty per site I hold OUTSIDE my home while my home still has fillable voids (non-Pathfinder). */
  homePremature: number
  /** HEAVY penalty per site I planted on an ENEMY Harbinger portent slot (a wasted placement). */
  harbingerEnemySlot: number
  /** bonus per site I planted on one of MY OWN Harbinger portent slots (prized development). */
  harbingerOwnSlot: number

  // ── Economy / cards ────────────────────────────────────────────────────────
  /** per SPELL in my hand — kept tiny on purpose. A card's value is realised by PLAYING it; a large hand
   *  weight makes the bot hoard (draw + pass) instead of developing. Sites in hand count 0 (see eval.ts). */
  myHand: number
  /** flat HP-value the SEARCH credits for DRAWING a card during your turn (≈ 3.5 HP). NOT an evaluate()
   *  term — the search threads it along each line so it survives to the leaf. Crucially the search never
   *  reveals the drawn card: a drawn SPELL ends that line (no inference — you re-plan with the real card
   *  once you actually draw it); a drawn SITE may still be reasoned about (it's a fungible mana source). */
  drawValue: number
  /** per UNKNOWN card in the FOE's hand (negative — their hidden options are threats). ≈ 3.5 HP. */
  foeHand: number
  /** per card I can still play/summon from my cemetery (reduced — non-damage resource). */
  cemeteryPlayable: number
  /** penalty as my draw piles (spellbook + atlas) shrink toward empty (deckout). */
  deckoutRisk: number
}

/** Seed values — HP-anchored (avatarLifePerHp = 10 → "N HP" = 10 N). Tune via the mirror sweep. */
export const DEFAULT_WEIGHTS: EvalWeights = {
  win: 100000,

  avatarLifePerHp: 10,
  lowLifeThreshold: 12, // (was 8) start guarding life EARLIER — the convex zone now covers 20→12→0
  lowLifeQuadratic: 1.8, // (was 1.5) steeper ramp: each HP lost hurts more the lower you already are
  foeLifePressure: 14, // DEALING DAMAGE is the driver: foe HP lost ≈ 10 (differential) + 14 = ~24 each

  foeDeathsDoor: 50,
  chaseDeathsDoor: 12, // chasing a death's-door avatar is the whole game — prized heavily
  interrogatorChase: 14, // strong approach gradient so the Interrogator marches at the enemy avatar
  myDeathsDoor: 50,
  fleeDeathsDoor: 3,
  foeAvatarThreatened: 6, // avatar aggression — kept
  interrogatorAggression: 20, // striking the enemy avatar IS the win condition (tax 3 or draw) — prized high

  avatarUndefended: 9, // always on — value keeping a defender on the avatar
  avatarUndefendedVsInterrogator: 26, // much more vs an Interrogator (an unblocked strike taxes you)
  avatarUndefendedDeathsDoor: 42, // and heavily at death's door (a single strike ends you)
  avatarIdle: 26, // (was 12) while developing (<6 sites) an untapped avatar is a WASTED site play — prized
  avatarWander: 28, // roaming instead of developing (scaled ×2 weak / ×1 strong <4 sites / ×0.5 strong 4–5)
  avatarTapWaste: 45, // Tap squandered on a non-site ability vs developing — heavy (>a card/site's worth) so
  //                     it beats even a strong Tap while developing; scaled ×1 <5 / ×0.5 at 5 / ×0.2 at 6 / 0 above 6
  myAvatarExposed: 9, // (was 6) — flinch harder from incoming avatar threat; don't over-extend into it

  // Material: DAMAGE still leads, but placing minions is worth a bit more so the bot plays cards from
  // hand instead of hoarding them. (Non-lethal minion damage is NOT counted — it heals every turn.)
  unitStat: 3,
  unitCost: 6,
  foeUnitFactor: 1.4, // enemy minions count 1.4× — value removing them, and respect them defensively
  supportAbility: 8,
  tappedPenalty: 4,
  summonSickPenalty: 2,
  disabledPenalty: 12,

  kwAirborne: 4,
  kwRanged: 4,
  kwLethal: 6, // helps secure kills → kept a touch higher
  kwStealth: 3,
  kwWard: 6, // kept — survivability
  kwSpellcaster: 5,
  kwImmobile: -4,

  auraCost: 4, // reduced (non-damage board value)
  artifactMonument: 5, // per cost — a monument permanent, to its controller
  artifactCarried: 3, // per cost — a carried artifact (+ my carrier, − enemy carrier); uncarried = 0
  siteMana: 30, // per EARLY controlled site; diminishing after 4, nothing past 6 (siteWorth in eval.ts)
  thresholdFit: 8,
  siteControl: 0, // folded into the diminishing siteWorth (kept for compat)
  exposedSite: 5, // my razable sites (defence)
  foeExposedSite: 5, // enemy razable sites — a damage route
  homeIntruded: 40, // SEVERE — an enemy site inside your home
  homePremature: 12, // expanding outside home before filling it — penalised, but less
  harbingerEnemySlot: 35, // HEAVY — a site wasted on the enemy's Harbinger portent
  harbingerOwnSlot: 20, // prized — developing onto your own Harbinger portents

  drawValue: 35, // ≈ 3.5 HP flat per card drawn this turn (search-applied; drawn card stays unknown)
  myHand: 5, // deliberately tiny — a card's real value is realised by PLAYING it, not holding it. A big
  //            hand weight makes the bot HOARD (draw + pass every turn) instead of developing. Keep just
  //            a whisper so drawing during the turn isn't worthless. (Sites in hand count 0 — see eval.ts.)
  foeHand: -35, // ≈ 3.5 HP per UNKNOWN card in the foe's hand (their hidden options are real threats)
  cemeteryPlayable: 5,
  deckoutRisk: 30,
}
