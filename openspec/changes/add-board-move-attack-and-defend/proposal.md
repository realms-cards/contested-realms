## Why
Players need a clear, minimal way to initiate combat when moving an existing unit on the board, without changing playdown behavior. We also want to preserve today’s freeform movement and add an opt‑in guided flow that helps new or returning players.

## What Changes
- Add an Interaction Guides toggle (default OFF) that enables guidance overlays for combat interactions.
- When moving an existing unit with base power to a tile with valid enemy targets, show a chooser: Move only vs Move & Attack. If no valid target, default to Move (no prompt).
- On Move & Attack, declare an attack on that tile and open a defense window for the opponent to assign defenders (including dragging units/avatar to the tile during the window; no movement constraints enforced in this phase).
- Add a transient `pendingCombat` state and lightweight socket “message” events: `attackDeclare`, `combatSetDefenders`, `combatResolve`, `combatCancel`.
- Minimal resolution for MVP: tap attacker and selected defenders and log a summary. No damage/strike rules yet. No movement/path validation.

## Impact
- Affected specs (capabilities):
  - gameplay-combat-declare
  - gameplay-defense-assignment
  - ui-interaction-guides
- Affected code (indicative):
  - Client: game board drag/drop and overlays (Board), game state (store), new UI components (AttackChoiceDialog, DefensePanel)
  - Net: client message handlers; server message routing on the generic “message” channel
  - Data: use `/api/cards/meta` to detect base power (attack) and cache per card
