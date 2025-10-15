## 1. Implementation
- [ ] T001 Scaffold engine module boundaries
  - Define interfaces: `features(state)`, `evaluate(state, theta)`, `search(state, theta, budgetMs): move`.
  - Add deterministic RNG seeded by match seed and player seat.
  - Accept Sorcery state snapshot compatible with `server/index.js` patches.
- [ ] T002 Parameter config (θ) loader + schema
  - Define YAML/JSON schema (<=200 numeric weights, rollout probs, ε/noise).
  - Add default `data/bots/params/champion.yaml` with hand-tuned θ.
  - Hot-swap file path via env var.
- [ ] T003 Minimal feature extractor (v1)
  - Board presence: total ATK/HP my vs opp; threats that can attack next.
  - Card economy: hand diff; draw potential proxy.
  - Tempo/mana: spent vs wasted this turn; on-curve penalty if missed.
  - Life/lethal: lethal-now, opp-lethal-next; expected clock.
  - Risk: sweeper-risk constant (0 for v1).
- [ ] T004 Greedy + beam search (iterative deepening)
  - Move ordering: on-curve play, remove biggest threat, develop engine.
  - Beam width configurable (k); quiescence on lethal/removal.
  - Time control: per-turn budget (e.g., 40–80ms) + soft node cap; always move.
- [ ] T005 State hashing + eval cache
  - Zobrist-style 64-bit hash; cache `V(s; θ)` across transpositions.
  - Reset between turns; reuse across siblings.
- [ ] T006 Telemetry & logging
  - Per turn: seed, θ id, candidate moves, chosen, root features, root eval, nodes, depth, beam, timeMs.
  - Write JSONL to `logs/training/YYYYMMDD/*.jsonl` (server-side); console summary in dev.
- [ ] T007 Engine integration in bot client
  - In `bots/headless-bot-client.js`, replace `_maybeAct` heuristics with `search(...)`
    when `NEXT_PUBLIC_CPU_BOTS_ENABLED` and `CPU_AI_ENGINE_MODE=evaluate`.
  - Keep draft/deck submission logic unchanged.
- [ ] T008 Determinism & modes
  - Evaluation mode: ε=0, noise=0. Training mode: ε>0, small Gumbel noise on leaves.
  - Root ε-greedy only; controlled by θ.
- [ ] T009 Training runner (self-play, CEM)
  - Node script `scripts/training/selfplay.js` with population of θ, fixed seed list, paired matches (swap seats), Elo/Glicko ratings, CEM selection and resampling.
  - Export best θ as `data/bots/params/champion.yaml` with generation id.
- [ ] T010 Opening/mulligan book (v1)
  - Collect first 2–3 turns and mulligan decisions with outcomes.
  - Build n-gram table (state-hash → move) with win-rate; optional UCB1 during training.
- [ ] T011 Rollout policy table (optional)
  - For MCTS or shallow playouts, configurable rule probabilities; include in θ.
- [ ] T012 Admin dashboard ladder view
  - Next.js admin dashboard at `/admin` to show θ id, Elo, generation, recent head-to-heads, and current champion metadata.
- [ ] T013 Tests
  - Vitest: feature extractor unit tests; evaluation monotonicity checks; determinism test (seeded); search picks legal moves within budget.
- [ ] T014 Docs & configs
  - README section: how to enable bots, run training, and hot-swap θ.
  - Example θ template and commented fields.

- [ ] T015 Artifact export/import tooling
  - CLI scripts to export champion θ and logs to a portable bundle; import champion on another instance.

- [ ] T016 Rulebook alignment checklist
  - Maintain a phase-in checklist mapped to `reference/SorceryRulebook.pdf` sections; update as coverage expands.

## 2. Validation
- [ ] V001 Determinism check: running the same state/seed/θ yields same move and eval.
- [ ] V002 Time budget: 1000 random main-phase states complete within budget and produce legal moves.
- [ ] V003 Sanity matches: champion θ beats baseline greedy ≥60% over 200 paired games.
- [ ] V004 Logging: JSONL files contain required fields; parse script summarizes stats.
- [ ] V005 Soft budgets: under stress cases, engine returns a legal move without exceeding practical latency (no hard caps enforced).
