## Why
Current CPU bots are naive and cannot reliably play Sorcery. We need a deterministic, debuggable, parameterized rules+search engine that can be tuned via self-play—no LLMs or deep nets.

## What Changes
- Parameterized bot engine with legal-move generation, fast simulator, and seeded RNG.
- Evaluation function V(s; θ) using transparent features (board presence, tempo/mana, card economy, life/lethal pressure, synergy hooks, risk controls).
- Search policy: iterative deepening + beam search with quiescence; simple move ordering; optional ε-greedy root exploration and small Gumbel noise (training only).
- Config packaging for θ in YAML/JSON and hot-swap of "champion" parameters.
- Self-play training runner: population-based (CEM/CMA-ES), Elo/Glicko ratings, champion gating, paired matches by common seeds.
- Telemetry and logs: per-turn features/evals, chosen move, nodes/depth, time budgets; match seeds and θ id.
- Minimal opening/mulligan book derived from frequencies; optional rollout policy table for large branches.
- Integration toggles and safety: off by default; env flags to enable, deterministic evaluation mode separate from training mode.

## Impact
- Affected specs: bot-engine, bot-training.
- Affected code:
  - bots/headless-bot-client.js (consume engine to pick moves; preserve current draft/deck submission logic)
  - server/index.js (env toggles, optional CPU auto-join hooks; no rule authority change)
  - scripts/ (training runner, tournament harness)
  - data/ (θ configs, logs, champion file)
- DB changes: none for v1; JSON files for θ and logs. Future: optional tables for ratings/history.
