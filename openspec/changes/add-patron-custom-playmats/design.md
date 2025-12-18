## Context

The board renderer already supports `playmatUrl` (texture URL) and a separate grid overlay. For Patrons, we need private, per-user playmat assets that are exported to the exact texture dimensions used by the board (2556×1663).

## Goals / Non-Goals

- Goals:
  - Patron-only upload + editor workflow
  - Fixed export size: 2556×1663 PNG
  - Private storage in Postgres
  - Selection between standard playmats and up to 5 custom playmats
- Non-Goals:
  - Sharing playmats between users
  - Unlimited uploads/storage

## Decisions

- Storage
  - Store exported PNG bytes in Postgres (`Bytes`) with metadata (`mimeType`, `width`, `height`, `createdAt`).
  - Enforce maximum of 5 playmats per user.
- Privacy / Access Control
  - All playmat API endpoints require an authenticated session.
  - Playmat image bytes are only readable by the owning user.
- Editor Output
  - Client exports a PNG at 2556×1663.
  - The grid overlay used for preview is not baked into the exported PNG (preview-only).
- Selection
  - Store the user’s selected playmat as either:
    - `standard:<key>` (for built-in playmats), or
    - `custom:<playmatId>` (for DB-backed playmats)
  - The board state `playmatUrl` is derived from this selection.

## Risks / Trade-offs

- DB storage increases database size.
  - Mitigation: enforce strict limits (count, dimensions, max bytes).
- Export correctness depends on browser canvas.
  - Mitigation: export only from the editor, validate dimensions server-side.

## Migration Plan

- Add Prisma model(s) and a nullable user preference for selected playmat.
- Add API routes.
- Add UI page.
- Wire into board `playmatUrl`.

## Open Questions

- Exact Patron gating rule: any `patronTier != null` vs specific tiers.
- Standard playmats registry: static list in code vs DB-backed list.
