## Context
This change introduces a minimal combat initiation UX tied to board movement (not playdown). It preserves current freeform movement and adds an opt‑in guided experience to declare an attack and allow defender assignment without enforcing movement or combat rules yet.

## Goals / Non-Goals
- Goals:
  - Chooser on cross‑tile move (Move vs Move & Attack) when valid targets exist
  - Defense window for opponent to select/drag defenders
  - Transient combat state synchronized via lightweight socket messages
  - Minimal resolution (tap + log)
- Non‑Goals (Phase 1):
  - Damage/strike timing, deaths, site surface/Avatar life loss
  - Movement path/range enforcement
  - Multiple simultaneous combats

## Decisions
- Use Interaction Guides flag to gate the chooser and defense panel; default OFF to preserve existing workflows.
- Use generic `socket.on("message")` channel with new types for lowest integration cost (parity with existing boardPing/d20Roll).
- Represent attacker/defenders with `instanceId` + (at,index) for robust mapping.
- Defer server authority for resolution; client applies taps and logs for MVP.

## Risks / Trade-offs
- Race in identifying the moved attacker after cross-tile move → mitigate by referencing last appended permanent; rely on `instanceId`.
- No rules enforcement may surprise competitive players → gated via guides and clearly logged; future phases add rules.

## Migration Plan
- Feature flag ships OFF; no behavior change until enabled.
- Add UI and message handling behind flag; iterate on UX.

## Open Questions
- Should cancel be permitted after declare? (MVP: yes.)
- Timer for defense window? (MVP: none.)
- Extend to allow declaring attack without moving (context menu) in a later change.
