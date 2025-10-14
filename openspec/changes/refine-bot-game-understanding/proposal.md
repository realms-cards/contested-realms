## Why
The current CPU bot (from `add-parameterized-rules-bot`) exhibits severe pathological behavior: it plays only sites every turn and never plays minions, spells, or meaningful actions. Training logs show all candidate moves evaluated to score=0, causing random selection among site-heavy candidates. The evaluation function fails to capture meaningful game state differences, and the rule comprehension system doesn't enforce proper Sorcery game flow (mana costs, threshold requirements, turn structure). We need to fundamentally refine the bot's understanding of Sorcery's rules and strategic primitives to enable functional play and serve as a tutorial opponent.

## What Changes
- **Rule-Aware Game State Model**: Explicit representation of mana availability, threshold accumulation, phase tracking, and legal action validation per `reference/SorceryRulebook.pdf`.
- **Cost & Threshold Validation**: Enforce mana costs when playing cards; validate threshold requirements before candidate generation; track tapped/untapped sites and mana providers.
- **Enhanced Evaluation Function**: Replace zero-variance evaluation with meaningful signals: board development rate, mana efficiency, tempo (cards played vs. passed turns), threat deployment, life pressure, and win condition proximity.
- **Strategic Primitives Library**: Codify fundamental Sorcery concepts (establish mana base, deploy threats, apply pressure, defend against lethal, manage card advantage) as weighted components in theta.
- **Candidate Pruning & Prioritization**: Eliminate illegal moves at generation time; prioritize sequences that advance game state (play units when mana available) over degenerate loops (spam sites indefinitely).
- **Diagnostic Telemetry**: Extend logging to capture why moves score equally, which features fire, and what constraints eliminate candidates—enabling root-cause analysis of future regressions.
- **Rulebook Integration**: Align bot logic with extracted rules from `reference/SorceryRulesExtracted.csv` and `reference/BotRules.csv`; phase in coverage systematically.
- **Tutorial Mode Foundation**: Design evaluation weights and move selection to demonstrate proper Sorcery play patterns (curve out, develop board, attack when advantageous).

## Impact
- Affected specs: bot-engine (comprehensive rewrite of evaluation + legality), bot-training (updated feature definitions and constraints).
- Affected code:
  - `bots/engine/index.js` (core rewrite: state model, candidate generation, evaluation, rule validation)
  - `scripts/training/selfplay.js` (telemetry schema update for new features)
  - `data/bots/botrules.json` (expand to full rule set with cost/threshold enforcement)
  - `reference/` (authoritative rulebook mappings)
- DB/schema changes: None (logs remain JSONL; theta configs remain JSON/YAML).
- Dependencies: Continuation of `add-parameterized-rules-bot`; supersedes its evaluation and legality logic.
- Timeline: ~1 week for core rule modeling + evaluation rewrite; 1 week for training validation and tuning; tutorial mode UX integration follows separately.
