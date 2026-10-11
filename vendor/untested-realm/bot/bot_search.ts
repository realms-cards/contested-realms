// ─────────────────────────────────────────────────────────────────────────────
// SEARCH BOT — an adversarial turn-planner driven by the engine's own legal-move
// generator.
//
// It does NOT pick one greedy action at a time. On the first decision of my turn it
// searches the whole COMBINATION TREE of my turn — sequences of my actions, not just
// first moves — and commits to a *contingency plan*:
//
//   • MAX nodes  = my decisions. Beam-limited (top-K by static eval, plus the option
//                  to end the turn) so the tree stays tractable while still exploring
//                  real multi-action combos (move→buff→attack, cast→activate, …).
//   • MIN nodes  = the opponent's intra-turn answers — a DEFEND prompt during my
//                  attack. Fully enumerated; value = the opponent's worst-for-me pick
//                  (minimax). The plan stores EVERY branch keyed by the resulting
//                  state, so when control returns to me I follow the branch matching
//                  what the opponent actually did — no re-planning, and my line was
//                  already scored against their best defence.
//   • Leaves     = my turn is over → the opponent takes their turn with ONLY the units
//                  already on their board (no hidden hand) → static eval.
//
// The heavy search runs ONCE per turn; every following action this turn is an instant
// replay of the cached plan tree. We only re-plan on genuine divergence (a branch the
// search didn't see, a random outcome, or a step that became illegal).
//
// Correctness is guaranteed by construction: every candidate comes from `expandActions`
// (which trial-applies each on a clone), so the bot can never emit an illegal move.
// ─────────────────────────────────────────────────────────────────────────────
import {
  expandActions,
  cloneState,
  evaluate,
  opponent,
  avatarOf,
  actingSeatFor,
  applyAction,
  getCard,
  getScript,
  legalSiteSquares,
  stepDistance,
  effKeywords,
  siteAt,
  GRID_W,
  GRID_H,
  DEFAULT_WEIGHTS,
  type Action,
  type GameState,
  type PlayerId,
  type UnitState,
  type EvalWeights,
} from '@sorcery/shared'
import { botAction, botNeedsToAct, forceAtlasDraw, botActionKey } from './bot'

export interface SearchConfig {
  /** anytime deadline for planning the WHOLE turn (ms). The tree is grown best-first and the plan
   *  found so far is returned once this elapses. Runs once per turn (replays are instant). */
  timeBudgetMs: number
  /** MAX-node beam width: how many of my candidate actions to recurse into at each of my decisions
   *  in the first `beamDepth` plies (the tail runs greedily, width 1). Raise for deeper combo search. */
  beamWidth: number
  /** how many plies deep the full-width beam applies before narrowing to greedy (width 1). */
  beamDepth: number
  /** hard cap on my-turn plan depth (actions) — a termination guard, not usually reached. */
  maxPlanDepth: number
  /** max actions the opponent plays with its on-board units in the leaf turn-reply rollout. */
  oppTurnMaxActions: number
  /** safety cap on simulated candidate-expansions per turn plan. */
  nodeBudget: number
  /** ONLY when the foe avatar is at death's door: decline site attacks (site damage is life-loss,
   *  which can't finish a DD avatar). Normally razing an undefended site is a fine damage route. */
  avoidSiteAttacksAtDeathsDoor: boolean
  /** OFF by default. When true, the draw-pile choice (spellbook vs atlas) is delegated to the procedural
   *  bot, which balances spell/site draws by need. Off = the search's own behaviour (fine for aggressive
   *  spell decks like the Interrogator). A toggle for A/B testing. */
  proceduralDraws: boolean
  /** multi-turn lookahead APPLIES only while the current turn is ≤ this (early game only). Set 0 to
   *  disable. */
  earlyPlanUntilTurn: number
  /** absolute ceiling: never roll the game forward past this turn. */
  earlyHorizonTurn: number
  /** span cap: also never roll forward more than this many turns from now (INCLUDING opponent turns).
   *  The effective horizon is min(earlyHorizonTurn, currentTurn + maxLookaheadTurns). */
  maxLookaheadTurns: number
  weights: EvalWeights
  /** anti-loop ward (driver-fed): action keys (botActionKey) that already proved score-neutral this
   *  turn. They're excluded from the ROOT of the search + the plan replay, so the bot can't re-pick a
   *  score-neutral action in a loop (esp. after a timeout re-plan). */
  banned?: Set<string>
}

export const DEFAULT_SEARCH: SearchConfig = {
  timeBudgetMs: 5000, // anytime cap per planning search; runs once per turn (replays are instant)
  beamWidth: 4,
  beamDepth: 3,
  maxPlanDepth: 16,
  oppTurnMaxActions: 6,
  nodeBudget: 12000,
  avoidSiteAttacksAtDeathsDoor: true,
  proceduralDraws: false,
  earlyPlanUntilTurn: 7, // only look ahead while current turn ≤ 7
  earlyHorizonTurn: 8, // never roll past turn 8
  maxLookaheadTurns: 5, // and at most 5 turns from now (incl. the opponent's)
  weights: DEFAULT_WEIGHTS,
}

/** a move that razes an enemy site (declined when the foe avatar is at death's door). */
const isSiteAttack = (a: Action): boolean => a.t === 'moveAttack' && !!a.attack && 'site' in a.attack

/** Policy: the avatar must PLAY a site rather than DRAW one whenever it can — drawing is only a fallback
 *  when no site is playable. So drop every draw-site candidate as long as a play-site exists. */
function preferPlaySite(kids: { action: Action; next: GameState }[]): { action: Action; next: GameState }[] {
  const canPlay = kids.some((c) => c.action.t === 'avatarSite' && (c.action as { mode?: string }).mode === 'play')
  return canPlay ? kids.filter((c) => !(c.action.t === 'avatarSite' && (c.action as { mode?: string }).mode === 'draw')) : kids
}

const clone = cloneState // fast JSON clone (GameState is pure JSON) — the hottest op in the search
let NODES = 0
/** set true whenever a plan search bailed early (hit the deadline or node budget) rather than fully
 *  solving the turn. A partial tree must NOT be cached/replayed — we play its best first action, then
 *  re-plan from scratch on the next decision. */
let TIMED_OUT = false

/** a stable, exact signature of a position — used to key opponent-answer branches so the runtime can
 *  follow the branch matching what the opponent actually did. GameState is pure JSON and both the
 *  search clone and the live state are produced by the SAME engine path, so equal positions stringify
 *  identically (any nondeterministic drift just misses → a safe re-plan). */
const sig = (s: GameState): string => JSON.stringify(s)

/** FAIRNESS: the bot is handed the full state (true deck order), so simulating its own draws would
 *  reveal the exact upcoming cards — foreknowledge a real player can't have. Determinize by SHUFFLING
 *  both decks' order in the search's working copy: the bot still knows its decklist (fair) but no longer
 *  the order, so a simulated draw yields a random plausible card, not the real next one. Hands stay real
 *  (you can see your own hand) and every returned action is validated against the true state on replay. */
function determinize(state: GameState, me: PlayerId): GameState {
  const s = clone(state)
  const shuffle = (arr: string[]) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
  }
  for (const p of [0, 1] as PlayerId[]) { shuffle(s.players[p].spellbook); shuffle(s.players[p].atlas) }
  return s
}

/** True while `me` is the one to act: my open prompt, or my main phase with no pending prompt. */
function controlMine(state: GameState, me: PlayerId): boolean {
  if (state.winner !== null || state.phase === 'over') return false
  const p = state.prompts[0]
  if (p) return actingSeatFor(state, p.player) === me
  return state.phase === 'main' && actingSeatFor(state, state.activePlayer) === me
}

/** an opponent DEFEND-style prompt that interrupts MY turn (still my turn, but they must answer). */
function oppMustAnswer(state: GameState, me: PlayerId): boolean {
  const p = state.prompts[0]
  return !!p && actingSeatFor(state, p.player) === opponent(me) && actingSeatFor(state, state.activePlayer) === me
}

/** is `a` legal for `me` right now? (single clone+apply — cheap; used to validate a cached plan step) */
function legal(state: GameState, me: PlayerId, a: Action): boolean {
  const c = clone(state)
  try { return applyAction(c, me, a).ok } catch { return false }
}

// ── the cached contingency plan (a tree) ────────────────────────────────────
type PlanNode =
  | { kind: 'act'; action: Action; next: PlanNode } // play `action`, then continue with `next`
  | { kind: 'branch'; byState: Record<string, PlanNode> } // opponent answers → follow the matching state
  | { kind: 'end' } // my turn is over

let PLAN: PlanNode | null = null
let PLAN_SEAT: PlayerId | null = null
let PLAN_TURN = -1
/** hand-card ids known when the plan was built. If a NEW id appears (a mid-turn DRAW — e.g. the
 *  Interrogator drawing off an ally's strike), the plan is stale: we re-run the turn analysis, per the
 *  "whenever you draw a card, re-run your analysis" directive. Cast/played cards just remove ids, so
 *  they don't trip this — only genuinely new cards do. */
let PLAN_KNOWN: Set<string> = new Set()

/** did a card appear in hand that the current plan never saw? (a draw happened) */
function handHasNewCard(state: GameState, me: PlayerId): boolean {
  for (const id of state.players[me].hand) if (!PLAN_KNOWN.has(id)) return true
  return false
}

/** Advance the cached plan against the concrete `state`. Returns the next action to play, or null if
 *  the plan can't continue (divergence / exhausted) and a fresh plan is needed. */
function advancePlan(state: GameState, me: PlayerId): Action | null {
  while (PLAN) {
    if (PLAN.kind === 'end') { PLAN = null; return null }
    if (PLAN.kind === 'branch') {
      const nxt = PLAN.byState[sig(state)] // which opponent answer actually happened?
      if (!nxt) { PLAN = null; return null } // opponent did something we didn't enumerate → re-plan
      PLAN = nxt
      continue // descend (usually to an 'act')
    }
    // PLAN.kind === 'act'
    if (!legal(state, me, PLAN.action)) { PLAN = null; return null } // reality diverged → re-plan
    const a = PLAN.action
    PLAN = PLAN.next
    return a
  }
  return null
}

/** the opponent's LEAF turn-reply: only board units (moves/attacks, no casts or site plays), played
 *  greedily to MINIMISE my eval; my own defend prompts inside it pick best-for-me. Mutates+returns. */
function opponentBoardReply(state: GameState, me: PlayerId, cfg: SearchConfig, deadline: number): GameState {
  const foe = opponent(me)
  for (let step = 0; step < cfg.oppTurnMaxActions; step++) {
    if (state.winner !== null || NODES > cfg.nodeBudget || Date.now() > deadline) break
    const decider = state.prompts[0] ? actingSeatFor(state, state.prompts[0].player) : state.activePlayer
    if (decider !== foe && !state.prompts[0]) break // control has left the opponent's turn
    const children = expandActions(state, decider, { deadline, boardOnly: true })
    NODES += children.length
    if (!children.length) break
    const pickMin = decider === foe // opponent minimises my eval; my prompts maximise
    let best = children[0]
    let bestVal = pickMin ? Infinity : -Infinity
    for (const c of children) {
      const v = evaluate(c.next, me, cfg.weights)
      if (pickMin ? v < bestVal : v > bestVal) { bestVal = v; best = c }
    }
    if (best.action.t === 'endTurn' && decider === foe) return best.next // opponent chose to stop
    Object.assign(state, best.next)
  }
  return state
}

/** How an action changed MY draws: how many extra cards I drew, and the ids of any newly drawn SPELLS.
 *  A drawn spell must NOT be reasoned about — it's blinded (removed from the search's hand) so the bot
 *  can't infer/plan it; its worth is the flat draw bonus, and reality re-plans on the real card. A drawn
 *  SITE is left in hand (fine to reason about — a fungible ~1-mana source). */
function drawInfo(before: GameState, after: GameState, me: PlayerId): { extra: number; spellIds: string[] } {
  const extra = (after.flow?.drawsThisTurn?.[me] ?? 0) - (before.flow?.drawsThisTurn?.[me] ?? 0)
  if (extra <= 0) return { extra: 0, spellIds: [] }
  const had = new Set(before.players[me].hand)
  const spellIds = after.players[me].hand.filter((id) => !had.has(id) && getCard(after.cards[id].name).type !== 'Site')
  return { extra, spellIds }
}

/** Evaluate a state by its RESOLVED effect. If the action left one of MY prompts open — e.g. a spell
 *  whose targets are still to be chosen, or an artifact attach — greedily resolve those prompts (best
 *  answer at each step) BEFORE scoring. Otherwise the cast looks like a lost card with no benefit and the
 *  beam prunes it before its effect is ever applied, so the search never sees that Poisonous Dagger made
 *  a unit lethal, that Lightning Bolt cleared a site's defender, etc. Non-prompt states cost nothing extra
 *  (the loop doesn't run). This is what lets the tree judge EVERY action by its consequences, not just
 *  minion plays. */
function resolvedEval(state: GameState, me: PlayerId, cfg: SearchConfig, deadline: number): number {
  const drewBefore = state.flow?.drawsThisTurn?.[me] ?? 0
  let s = state
  let guard = 0
  while (guard++ < 8 && s.prompts[0] && actingSeatFor(s, s.prompts[0].player) === me && Date.now() < deadline) {
    const kids = expandActions(s, me, { deadline })
    if (!kids.length) break
    let best = kids[0]
    let bestV = -Infinity
    for (const c of kids) { const v = evaluate(c.next, me, cfg.weights); if (v > bestV) { bestV = v; best = c } }
    s = best.next
  }
  // credit the flat draw value for any card drawn WHILE resolving (Gift of the Frog draws when its
  // target prompt resolves) — otherwise a draw-spell ranks at its board-only value and gets pruned.
  const drew = Math.max(0, (s.flow?.drawsThisTurn?.[me] ?? 0) - drewBefore)
  return evaluate(s, me, cfg.weights) + drew * cfg.weights.drawValue
}

/** Play ONE player's whole turn greedily (1-ply best each step), from `me`'s perspective: my decisions
 *  maximise my eval, the opponent's minimise it. The opponent DEVELOPS (plays sites) but casts no spells
 *  — their hand is unknown, and "everyone plays a site each turn" is the one safe prior. Returns on the
 *  active player's endTurn. Mutates `state`. */
function greedyTurn(state: GameState, me: PlayerId, cfg: SearchConfig, deadline: number): void {
  for (let step = 0; step < 30; step++) {
    if (state.winner !== null || Date.now() > deadline || NODES > cfg.nodeBudget) return
    const p = state.prompts[0]
    const decider = p ? actingSeatFor(state, p.player) : actingSeatFor(state, state.activePlayer)
    const kids = preferPlaySite(expandActions(state, decider, decider === opponent(me) ? { deadline, noSpellCasts: true } : { deadline }))
    NODES += kids.length
    if (!kids.length) return
    const maximize = decider === me
    let best = kids[0]
    let bestVal = maximize ? -Infinity : Infinity
    // On MY turn, rank by resolved effect (so the rollout also plays spells/artifacts to their real
    // outcome, not just minions). On the ENEMY's modeled turn, cheap positional eval is enough — no need
    // to resolve their prompts, and it keeps the rollout affordable.
    for (const c of kids) {
      const v = maximize ? resolvedEval(c.next, me, cfg, deadline) : evaluate(c.next, me, cfg.weights)
      if (maximize ? v > bestVal : v < bestVal) { bestVal = v; best = c }
    }
    Object.assign(state, best.next)
    if (best.action.t === 'endTurn') return
  }
}

/** Value-of-position after my turn ends. Normally = the opponent's one reply turn. In the EARLY game
 *  (turn ≤ earlyPlanUntilTurn) it rolls the game forward several turns greedily (both sides, opponent
 *  developing sites), up to min(earlyHorizonTurn, now + maxLookaheadTurns) — early turns have little
 *  interaction, so planning ahead is cheap and lets the bot set up. Returns the rolled-forward state. */
function rollForward(state: GameState, me: PlayerId, cfg: SearchConfig, deadline: number): GameState {
  const s = clone(state)
  const horizon = state.turn <= cfg.earlyPlanUntilTurn ? Math.min(cfg.earlyHorizonTurn, state.turn + cfg.maxLookaheadTurns) : state.turn + 1
  let guard = 0
  while (s.winner === null && s.turn < horizon && Date.now() < deadline && NODES < cfg.nodeBudget && guard++ < 16) {
    const before = s.turn
    greedyTurn(s, me, cfg, deadline)
    if (s.turn === before) break // no progress → stop (safety)
  }
  return s
}

/**
 * The adversarial turn search. Returns the minimax value of `state` (from my POV) together with the
 * contingency plan tree that realises it. `drawBonus` is the flat draw value accumulated along this
 * line (threaded so it survives to the leaf; the search never inspects a drawn card). Recurses:
 *   MAX (my control) → beam over my actions;  MIN (opponent defend) → all answers, worst for me;
 *   leaf (my turn over) → opponent board reply → eval.  A drawn SPELL turns its line into a leaf.
 */
function search(state: GameState, me: PlayerId, cfg: SearchConfig, deadline: number, depth: number, drawBonus = 0): { val: number; plan: PlanNode } {
  const w = cfg.weights

  if (state.winner !== null || state.phase === 'over') return { val: evaluate(state, me, w) + drawBonus, plan: { kind: 'end' } }

  // ── leaf: my turn has ended (control is fully the opponent's) → roll the game forward (opponent's
  //     reply, and in the early game several turns ahead) then evaluate ──
  if (!controlMine(state, me) && !oppMustAnswer(state, me)) {
    return { val: evaluate(rollForward(state, me, cfg, deadline), me, w) + drawBonus, plan: { kind: 'end' } }
  }

  // ── MIN node: an opponent DEFEND during my turn — enumerate every answer, take the worst for me ──
  if (oppMustAnswer(state, me)) {
    const opp = opponent(me)
    const kids = expandActions(state, opp, { deadline })
    NODES += kids.length
    if (!kids.length) return { val: evaluate(opponentBoardReply(clone(state), me, cfg, deadline), me, w) + drawBonus, plan: { kind: 'end' } }
    const byState: Record<string, PlanNode> = {}
    let worst = Infinity
    for (const c of kids) {
      if (Date.now() > deadline) { TIMED_OUT = true; break }
      const sub = search(c.next, me, cfg, deadline, depth + 1, drawBonus) // draws already folded into drawBonus downstream
      if (sub.val < worst) worst = sub.val
      // flatten chained opponent decisions so every branch key is a state where control RETURNS to me
      if (sub.plan.kind === 'branch') Object.assign(byState, sub.plan.byState)
      else byState[sig(c.next)] = sub.plan
    }
    if (worst === Infinity) return { val: evaluate(state, me, w) + drawBonus, plan: { kind: 'end' } }
    return { val: worst, plan: { kind: 'branch', byState } }
  }

  // ── depth / time / node cutoff at a MAX node: end the turn here and score it ──
  if (depth >= cfg.maxPlanDepth || Date.now() > deadline || NODES > cfg.nodeBudget) {
    if (Date.now() > deadline || NODES > cfg.nodeBudget) TIMED_OUT = true // depth cap is a clean horizon; time/node bail is not
    const ended = clone(state)
    if (applyAction(ended, me, { t: 'endTurn' }).ok) {
      return { val: evaluate(opponentBoardReply(ended, me, cfg, deadline), me, w) + drawBonus, plan: { kind: 'act', action: { t: 'endTurn' }, next: { kind: 'end' } } }
    }
    // can't end (an open prompt of mine) → fall back to the single shallow-best child, no recursion
    let kids = expandActions(state, me, { deadline })
    if (depth === 0 && cfg.banned?.size) kids = kids.filter((c) => !cfg.banned!.has(botActionKey(c.action)))
    if (!kids.length) return { val: evaluate(state, me, w) + drawBonus, plan: { kind: 'end' } }
    let best = kids[0], bestS = -Infinity
    for (const c of kids) { const s = evaluate(c.next, me, w); if (s > bestS) { bestS = s; best = c } }
    return { val: bestS + drawBonus, plan: { kind: 'act', action: best.action, next: { kind: 'end' } } }
  }

  // ── MAX node: beam over my actions (top-K by static eval, always keep the end-turn option) ──
  let kids = preferPlaySite(expandActions(state, me, { deadline })) // draw a site only if none is playable
  // anti-loop ward: at the ROOT, drop actions already known score-neutral this turn (the first move is
  // what actually gets applied and could otherwise loop). Deeper plies are unaffected.
  if (depth === 0 && cfg.banned?.size) kids = kids.filter((c) => !cfg.banned!.has(botActionKey(c.action)))
  NODES += kids.length
  const foeDD = cfg.avoidSiteAttacksAtDeathsDoor && avatarOf(state, opponent(me)).deathsDoor
  if (foeDD) kids = kids.filter((c) => !isSiteAttack(c.action))
  if (!kids.length) return { val: evaluate(state, me, w) + drawBonus, plan: { kind: 'end' } }

  const k = depth < cfg.beamDepth ? cfg.beamWidth : 1
  // each action's OWN draw bonus: the flat +draw value for a SPELL it draws immediately, plus the AVATAR
  // draw-site ABILITY's diminishing site value (full sites 1–4, half 5–6, ~0 past 6). Computed once and
  // used for BOTH ranking and the recursion — otherwise a draw-spell ranks at its board-only value and
  // gets pruned before the draw is ever credited (Gift of the Frog draws a card → worth ~+drawValue).
  const ownBonus = (c: { action: Action; next: GameState }, di: { spellIds: string[] }): number => {
    let site = 0
    if (c.action.t === 'avatarSite' && (c.action as { mode?: string }).mode === 'draw') {
      const nSites = Object.values(state.sites).filter((s) => s.controller === me && !s.isRubble).length
      const playMarginal = nSites < 4 ? cfg.weights.siteMana : nSites < 6 ? cfg.weights.siteMana * 0.5 : 0
      site = playMarginal * 0.5
    }
    return cfg.weights.drawValue * di.spellIds.length + site
  }
  // rank by RESOLVED effect (+ the action's own draw bonus) so spells/artifacts whose value hides behind
  // a target prompt OR a card draw aren't pruned before their consequences are applied.
  const scored = kids.map((c) => {
    const di = drawInfo(state, c.next, me)
    const own = ownBonus(c, di)
    // only casts/activations hide value behind a prompt or a card draw → judge by RESOLVED effect. Moves,
    // attacks, site-plays resolve at once, so a cheap eval is accurate AND far cheaper — ranking every
    // move through a full prompt rollout is what blows the time budget (→ timeouts → re-plan-every-action).
    const resolve = (c.action.t === 'castSpell' || c.action.t === 'activate') && Date.now() < deadline
    const s = (resolve ? resolvedEval(c.next, me, cfg, deadline) : evaluate(c.next, me, w)) + own
    return { c, di, own, s }
  })
  scored.sort((a, b) => b.s - a.s)
  const chosen = scored.slice(0, k)
  const endEntry = scored.find((r) => r.c.action.t === 'endTurn')
  if (endEntry && !chosen.includes(endEntry)) chosen.push(endEntry) // "stop now" always competes

  let bestVal = -Infinity
  let bestAction: Action = chosen[0].c.action
  let bestNext: PlanNode = { kind: 'end' }
  for (const r of chosen) {
    if (Date.now() > deadline) { TIMED_OUT = true; break }
    const childBonus = drawBonus + r.own
    let next = r.c.next
    if (r.di.spellIds.length) {
      // BLIND drawn spells: the search must not reason about them (no inference). Remove them from the
      // working hand — their worth is the flat draw bonus; reality re-plans with the real cards once
      // they're actually drawn. The turn otherwise continues normally, so leaves stay comparable.
      next = clone(r.c.next)
      next.players[me].hand = next.players[me].hand.filter((id) => !r.di.spellIds.includes(id))
    }
    const sub = search(next, me, cfg, deadline, depth + 1, childBonus)
    if (sub.val > bestVal) { bestVal = sub.val; bestAction = r.c.action; bestNext = sub.plan }
  }
  return { val: bestVal, plan: { kind: 'act', action: bestAction, next: bestNext } }
}

const ELS = ['air', 'earth', 'fire', 'water'] as const

/** Hardcoded mulligan policy (returns the ≤3 hand-card ids to send back):
 *  1. any SPELL costing > 4 mana, or requiring > 3 of a single element's threshold — too greedy;
 *  2. if a spell we intend to keep needs an element NO site in hand can provide, also toss the
 *     "redundant" sites (those providing none of the elements our keepable spells need) to dig. */
export function mulliganTargets(state: GameState, me: PlayerId): string[] {
  const cards = state.players[me].hand.map((id) => ({ id, def: getCard(state.cards[id].name) }))
  const maxThr = (t: { air: number; earth: number; fire: number; water: number }) => Math.max(t.air, t.earth, t.fire, t.water)
  const spellScore = (d: { cost: number | null; thresholds: any }) => (d.cost ?? 0) + maxThr(d.thresholds)

  // Rule 1 — overcosted / over-thresholded spells
  const rule1 = cards.filter((c) => c.def.type !== 'Site' && ((c.def.cost ?? 0) > 4 || maxThr(c.def.thresholds) > 3))
  const rule1Ids = new Set(rule1.map((c) => c.id))

  // spells we intend to keep, and the elements they need
  const keepSpells = cards.filter((c) => c.def.type !== 'Site' && c.def.type !== 'Avatar' && !rule1Ids.has(c.id))
  const needed = new Set<string>()
  for (const s of keepSpells) for (const e of ELS) if ((s.def.thresholds as any)[e] > 0) needed.add(e)

  // Rule 2 — only when a needed element has no site in hand to provide it (unmatched), toss the
  // sites that provide nothing we need.
  const sites = cards.filter((c) => c.def.type === 'Site')
  const siteEls = (d: { elements: string[] }) => d.elements.map((x) => x.toLowerCase())
  const provided = new Set<string>()
  for (const st of sites) for (const e of siteEls(st.def)) if (needed.has(e)) provided.add(e)
  const unmatched = [...needed].some((e) => !provided.has(e))
  const redundantSites = unmatched ? sites.filter((st) => !siteEls(st.def).some((e) => needed.has(e))) : []

  // worst spells first, then redundant sites; capped at the 3-card mulligan limit
  const ordered = [
    ...rule1.sort((a, b) => spellScore(b.def) - spellScore(a.def)).map((c) => c.id),
    ...redundantSites.map((c) => c.id),
  ]
  return ordered.slice(0, 3)
}

/** squares with no site — a ground/void unit falls there, and Pathfinder blazes sites toward them. */
function voidSquares(state: GameState): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) if (!siteAt(state, x, y)) out.push({ x, y })
  return out
}

/** could any enemy board unit reach & strike `pt` next turn? (used to keep a Pathfinder move safe) */
function enemyCanReach(state: GameState, me: PlayerId, pt: { x: number; y: number }): boolean {
  const foe = opponent(me)
  for (const u of Object.values(state.units)) {
    if (u.controller !== foe || u.carriedBy || u.tapped) continue
    const kw = effKeywords(state, u)
    const reach = kw.immobile ? (kw.ranged ?? 1) : 1 + (kw.movement ?? 0) + (kw.ranged ?? 0)
    if (stepDistance(u, pt) <= reach) return true
  }
  return false
}

/** True for a Pathfinder-style avatar — one that plays its site via an ability (`noStandardSiteAction`)
 *  and wants to sit next to a void. This also catches a masked Imposter, whose active script (mask)
 *  the engine surfaces through the same flag. */
function isPathfinderLike(avatar: UnitState): boolean {
  return getScript(avatar.name)?.noStandardSiteAction === true
}

/** End-of-turn "don't waste it" pass, for behaviours the static eval doesn't capture. Returns an action
 *  to take INSTEAD of ending the turn, or null. Priorities: 1) play a site (normally or via Pathfinder's
 *  ability); 2) draw a site; 3) edge a Pathfinder/Imposter avatar toward a void via a safe move; 4) fire
 *  any ability that doesn't lower the eval. Candidates come from a fresh expansion of the CURRENT state. */
function endTurnCleanup(state: GameState, me: PlayerId, cfg: SearchConfig): Action | null {
  const w = cfg.weights
  const scored = expandActions(state, me, {}).map((c) => ({ c, val: evaluate(c.next, me, w) }))
  const bestOf = (pred: (a: Action) => boolean): { action: Action; next: GameState } | null =>
    scored.filter((s) => pred(s.c.action)).sort((a, b) => b.val - a.val)[0]?.c ?? null

  // 1. play a site — normal establishment, or Pathfinder's blaze ability
  const sitePlay = bestOf((a) => a.t === 'avatarSite' && a.mode === 'play') ?? bestOf((a) => a.t === 'activate' && a.ability === 'blaze')
  if (sitePlay) return sitePlay.action

  // 2. draw a site off the atlas
  const siteDraw = bestOf((a) => a.t === 'avatarSite' && a.mode === 'draw')
  if (siteDraw) return siteDraw.action

  // 2.5 don't pass with usable mana: if any RESOLVED cast of a hand card improves our position, do it.
  //     Casts are scored by their fully-resolved effect (removal/damage/draw all land) — a cheap
  //     `evaluate` of the pre-resolution state would hide the whole point of the spell. Bounded work:
  //     resolve only the few most promising casts by cheap eval first.
  const castDeadline = Date.now() + 800
  const baseline = resolvedEval(state, me, cfg, castDeadline)
  const castCandidates = scored
    .filter((s) => s.c.action.t === 'castSpell')
    .sort((a, b) => b.val - a.val)
    .slice(0, 6)
  let bestCast: { action: Action; val: number } | null = null
  for (const s of castCandidates) {
    if (Date.now() > castDeadline) break
    const val = resolvedEval(s.c.next, me, cfg, castDeadline)
    if (val > baseline + 1 && (!bestCast || val > bestCast.val)) bestCast = { action: s.c.action, val }
  }
  if (bestCast) return bestCast.action

  // 3. Pathfinder / masked-Imposter: shuffle the avatar toward the nearest void, but only via a move
  //    that gets it closer AND lands somewhere no enemy can hit it
  const avatar = avatarOf(state, me)
  if (isPathfinderLike(avatar)) {
    const voids = voidSquares(state)
    if (voids.length) {
      const distTo = (u: { x: number; y: number }) => Math.min(...voids.map((v) => stepDistance(u, v)))
      const now = distTo(avatar)
      const move = scored
        .filter((s) => s.c.action.t === 'moveAttack' && (s.c.action as any).unitId === avatar.id && !(s.c.action as any).attack)
        .map((s) => ({ s, av: s.c.next.units[avatar.id] as UnitState | undefined }))
        .filter((x) => x.av !== undefined && distTo(x.av) < now && !enemyCanReach(x.s.c.next, me, x.av))
        .sort((a, b) => b.s.val - a.s.val)[0]
      if (move) return move.s.c.action
    }
  }

  // 4. any activated ability whose RESOLVED effect STRICTLY improves our position. Judge by the fully
  //    resolved result, not the pre-prompt eval: an ability that merely opens an optional prompt and
  //    changes nothing — Animist's "cast a magic as a Spirit" when declined — otherwise looks neutral
  //    and gets fired as a recorded NO-OP. We never commit a do-nothing action; end the turn instead.
  const abilityDeadline = Date.now() + 400
  const abilityCandidates = scored.filter((s) => s.c.action.t === 'activate').sort((a, b) => b.val - a.val).slice(0, 6)
  let bestAbility: { action: Action; val: number } | null = null
  for (const s of abilityCandidates) {
    if (Date.now() > abilityDeadline) break
    const val = resolvedEval(s.c.next, me, cfg, abilityDeadline)
    if (val > baseline + 1 && (!bestAbility || val > bestAbility.val)) bestAbility = { action: s.c.action, val }
  }
  if (bestAbility) return bestAbility.action

  return null
}

/** Hardcoded early development: on the bot's SECOND turn, plant a held site directly IN FRONT of its
 *  avatar (one square toward the enemy) if that's a legal placement — a deterministic opening the eval
 *  alone doesn't reliably pick. Skipped for Pathfinders (they develop via their own ability) and once
 *  the avatar has already used its site action this turn. */
function playSiteInFront(state: GameState, me: PlayerId): Action | null {
  const myFirstTurn = me === state.firstPlayer ? 1 : 2
  const myTurnIndex = Math.floor((state.turn - myFirstTurn) / 2) + 1
  if (myTurnIndex !== 2 || state.players[me].usedAvatarSiteAbility) return null
  const av = avatarOf(state, me)
  if (getScript(av.name)?.noStandardSiteAction) return null
  const fx = av.x
  const fy = av.y + (me === 0 ? 1 : -1) // "in front" = one square toward the enemy half
  for (const cardId of state.players[me].hand) {
    const def = getCard(state.cards[cardId].name)
    if (def.type !== 'Site') continue
    if (legalSiteSquares(state, me, def.name).some((s) => s.x === fx && s.y === fy)) {
      return { t: 'avatarSite', mode: 'play', cardId, x: fx, y: fy }
    }
  }
  return null
}

/** Choose `me`'s next action. On the first decision of my turn this searches the whole turn tree and
 *  caches a contingency plan; subsequent actions replay it (instant) until reality diverges. */
export function searchBotAction(state: GameState, me: PlayerId, cfg: SearchConfig = DEFAULT_SEARCH): Action {
  if (state.phase === 'mulligan') return { t: 'mulligan', back: mulliganTargets(state, me) }
  // piloting the opponent's turn (Thaïs) stays with the existing policy for now
  if (state.phase === 'main' && state.activePlayer !== me && !state.prompts[0]) return botAction(state, me, cfg.banned)
  // OPTIONAL: delegate the draw-pile choice to the procedural policy (it balances spell vs site draws).
  // OFF by default — the search's own behaviour (mostly drawing spells) is fine for aggressive decks like
  // the Interrogator. Flip cfg.proceduralDraws to compare.
  const p0 = state.prompts[0]
  if (cfg.proceduralDraws && p0 && p0.kind === 'drawDeck' && actingSeatFor(state, p0.player) === me) return botAction(state, me)
  // Guarantee mana development: on the bot's 3rd turn with no site drawn yet, force an atlas draw
  // (overriding the search's usual preference for spells). See forceAtlasDraw.
  if (p0 && p0.kind === 'drawDeck' && actingSeatFor(state, p0.player) === me && forceAtlasDraw(state, me)) {
    return { t: 'prompt', promptId: p0.id, choice: 'atlas' }
  }
  // Hardcoded turn-2 opening: plant a held site directly in front of the avatar before searching.
  if (!p0 && state.activePlayer === me) {
    const front = playSiteInFront(state, me)
    if (front) return front
  }

  // ── replay the cached plan if it's still ours, this turn's, and no draw has invalidated it ──
  if (PLAN && PLAN_SEAT === me && PLAN_TURN === state.turn && !handHasNewCard(state, me)) {
    const a = advancePlan(state, me)
    // …unless the plan's next move is one the ward has since banned (score-neutral) — then drop the
    // plan and re-search so the banned action is excluded at the root below.
    if (a && !(cfg.banned?.has(botActionKey(a)))) return withCleanup(state, me, cfg, a)
    if (a) PLAN = null
  }

  // ── (re)plan the whole turn ──
  NODES = 0
  TIMED_OUT = false
  const start = Date.now()
  const deadline = start + cfg.timeBudgetMs
  // search on a determinized copy (decks shuffled) so the bot can't exploit its own draw order; the
  // chosen action is applied to the REAL state by the caller, and replay re-validates against it.
  const { plan } = search(determinize(state, me), me, cfg, deadline, 0)
  PLAN = plan; PLAN_SEAT = me; PLAN_TURN = state.turn; PLAN_KNOWN = new Set(state.players[me].hand)
  if (typeof process !== 'undefined' && process.env.SEARCH_DEBUG) {
    // eslint-disable-next-line no-console
    console.error(`t${state.turn} plan depth=${planDepth(plan)} nodes=${NODES} took=${Date.now() - start}ms budget=${cfg.timeBudgetMs} timedOut=${TIMED_OUT}`)
  }
  const a = advancePlan(state, me)
  // a partial (timed-out) tree isn't trustworthy past its first action — play that move, then drop the
  // tree so the NEXT decision rebuilds it with a fresh full budget. A completed tree stays cached.
  if (TIMED_OUT) PLAN = null
  if (a && !(cfg.banned?.has(botActionKey(a)))) return withCleanup(state, me, cfg, a)
  return botAction(state, me, cfg.banned) // generator offered nothing legal → base policy (ban-aware)
}

/** If we're about to end the turn, first try the "don't waste it" cleanup (site play/draw, Pathfinder
 *  void-edge, harmless ability). If cleanup acts, drop the plan so the remainder is re-searched. */
function withCleanup(state: GameState, me: PlayerId, cfg: SearchConfig, a: Action): Action {
  if (a.t !== 'endTurn') return a
  const cleanup = endTurnCleanup(state, me, cfg)
  if (cleanup) { PLAN = null; return cleanup }
  return a
}

/** longest path through the plan tree (debug only). */
function planDepth(p: PlanNode): number {
  if (p.kind === 'end') return 0
  if (p.kind === 'act') return 1 + planDepth(p.next)
  let m = 0
  for (const k in p.byState) m = Math.max(m, planDepth(p.byState[k]))
  return m
}

export const searchBotNeedsToAct = botNeedsToAct
