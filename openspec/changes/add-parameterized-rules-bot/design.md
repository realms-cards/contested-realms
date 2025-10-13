## Context
Current CPU bot logic in `bots/headless-bot-client.js` uses hardcoded heuristics and sends state patches via Socket.IO. We need a deterministic rules+search bot with transparent features and tunable parameters. No neural nets or external AI.

## Goals / Non-Goals
- Goals: deterministic engine, parameterized eval, fast search with budgets, self-play training (CEM), logs/telemetry, hot-swappable θ.
- Non-Goals: change server authoritative rules, add new DB schema (v1), neural network policies.

## Decisions
- Engine as a pure library consumed by the headless bot client; outputs a legal move (patch) for the current Sorcery state.
- Use seeded RNG per match (seed + player seat) for reproducibility; isolate exploration to training mode.
- Feature vector kept small (<=50 features initially), weights θ kept <=200 parameters.
- Search: iterative deepening with beam search and quiescence; MCTS deferred unless branching requires it.
- State hashing with Zobrist-like keys to cache evaluations across transpositions.
- Config files: YAML for θ; JSONL for logs; placed under `data/bots/params/` and `logs/training/`.

## Risks / Trade-offs
- Risk: Search time budgets missed under extreme branching.
  - Mitigation: node caps, beam width clamp, fast move ordering.
- Risk: Eval mis-specification yields brittle play.
  - Mitigation: start minimal; add features incrementally as mistakes surface; retrain.
- Risk: Environment flag inconsistencies.
  - Mitigation: Respect existing `NEXT_PUBLIC_CPU_BOTS_ENABLED`; add a separate `CPU_AI_ENGINE_MODE` (evaluate|train) for clarity.

## Migration Plan
- Ship greedy+beam with hand-tuned θ first; gate behind flags.
- Replace `_maybeAct` with engine call only when flags enabled.
- Add training runner and promote champion after validation.

## Open Questions
- Do we want a server-side evaluation endpoint for offline benchmarking? (likely no in v1)
- Should we persist match logs in DB later for richer analysis?
