# Match State Sync Remediation Tasks

## Tracking
- [x] Establish per-instance identifiers for all `CardRef` entries in zones (update schema, creators, serializers, and consumers).
- [x] Propagate instance identifiers through permanents and zone moves so ownership transfers keep identity intact.
- [x] Replace `deepMergeReplaceArrays` for zones/permanents with an instance-aware merge that applies add/remove/move operations deterministically.
- [x] Update client zone operations to batch removal and insertion into a single atomic patch (zones now sanitize per-seat patches and emit combined updates).
- [x] Ensure control-transfer flows authoritatively update both permanents _and_ zones, including owner metadata.
- [x] Adjust snapshot handling so pending local patches affecting zones/permanents are reconciled instead of dropped silently.
- [x] Introduce server-side validation for zone ownership and conflicting patches before merging.
- [x] Revisit echo filtering to confirm legitimate zone/permanent updates are never discarded; adjust signature inputs if needed.
- [x] Add tests covering concurrent zone edits, ownership transfers, and snapshot reconciliation.

## Remaining Fixes & Follow-ups
- [x] Server moves battlefield bookkeeping on permanent control transfer (remove client zone writes).
- [x] Queue avatar tap/offset patches when actor seat unknown; flush once actorKey is set.
- [x] Add unit tests for permanent transfer + server battlefield sync.
- [x] Add unit tests asserting avatar tap persistence across sync.

## Future Work
- [x] Make tap state (and similar per-permanent fields) server-authoritative using `tapVersion` reconciliation; extend the pattern to other mutable flags as needed.
- [x] Introduce partial permanent patches (instance-level deltas for counters, taps, additions, removals, control swaps, and board-to-board moves).
- [x] Introduce server-side versioning (per-permanent clock or vector) so concurrent ownership transfers can be ordered deterministically.
- [ ] Backfill permanent `instanceId`/`version` values in the persisted game state and wire server ingestion paths to reject missing identities.
