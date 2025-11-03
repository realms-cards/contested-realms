## 1. Implementation
- [x] 1.1 Add Interaction Guides feature flag in store with localStorage persistence and small toggle in the online play UI (default OFF)
- [x] 1.2 Build card meta cache and preload helper (fetch `/api/cards/meta?ids=...`) using cardIds from both seats; provide lazy fetch fallback
- [x] 1.3 Add `pendingCombat` state to store with actions: `declareAttack`, `setDefenderSelection`, `resolveCombat`, `cancelCombat`
- [x] 1.4 Socket message plumbing (server): add `attackDeclare`, `combatSetDefenders`, `combatResolve`, `combatCancel` on generic `message` channel with basic shape validation and room broadcast
- [x] 1.5 Socket message handling (client): subscribe to new types; update `pendingCombat`; tap/log on resolve; clear on cancel
- [x] 1.6 UI - AttackChoiceDialog overlay (Html) shown only after cross-tile move when Interaction Guides ON and valid target exists
- [x] 1.7 UI - DefensePanel (HUD) for defender with on-tile unit selection, live updates on drag-in defenders, Done/Cancel
- [x] 1.8 Board integration: on cross-tile move, detect base power + valid targets; show chooser; Move only keeps as-is; Move & Attack calls `declareAttack` and emits event; same-tile reposition never prompts; if no valid target, default Move
- [x] 1.9 Minimal resolution: tap attacker and selected defenders; log concise summary; clear `pendingCombat` (no damage/strike rules)
- [ ] 1.10 QA: manual test plan (attacker declares → defender assigns on-tile and via drag → resolve → verify sync/taps/logs; guides OFF path still pure move)
- [ ] 1.11 Optional metrics: count attacks declared and defenders assigned (dev console only)

## 2. Validation
- [ ] 2.1 `openspec validate add-board-move-attack-and-defend --strict`
- [ ] 2.2 Local end-to-end smoke test in constructed mode (two clients)
- [ ] 2.3 Confirm logs concise and no ghost drags/patch spam

## 3. Documentation
- [x] 3.1 Update README/Docs with Interaction Guides toggle and basic flow
- [x] 3.2 Add short in-repo HOWTO for QA steps
