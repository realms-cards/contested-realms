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
